import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

const db = createServiceClient();
const ids = Array.from({ length: 18 }, () => randomUUID());
const pickupBase = randomInt(1_000_000_000, 2_000_000_000);
const incomplete = ["pending", "paid", "cooking", "cancelled", "refunded", "expired"];
const prefix = `t41-${randomUUID()}`;
let userId: string | undefined;
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth });
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth });

beforeAll(async () => {
    const inserted = await db.from("orders").insert(ids.map((id, index) => ({
        id, pickup_number: pickupBase + index,
        status: index < 12 ? "completed" : incomplete[index - 12],
        payment_method: "cash", total_amount: 3000,
        idempotency_key: randomUUID(), status_token: randomUUID().replaceAll("-", "").repeat(2),
    })));
    if (inserted.error) throw inserted.error;
    const email = `${prefix}@example.test`;
    const password = randomUUID();
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const signedIn = await admin.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
});
afterAll(async () => {
    const deleted = await db.from("orders").delete().in("id", ids);
    if (deleted.error) throw deleted.error;
    if (userId) {
        const removed = await db.auth.admin.deleteUser(userId);
        if (removed.error) throw removed.error;
    }
});

test("완료 주문 후기와 제출 시각 저장, 선택 텍스트 생략 허용", async () => {
    const result = await db.from("reviews").insert({ order_id: ids[0], rating: 4 })
        .select("order_id, rating, text, created_at").single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ order_id: ids[0], rating: 4, text: null });
    expect(Number.isNaN(Date.parse(result.data!.created_at))).toBe(false);
});
test("별점 1·5와 텍스트 빈 값·NULL·한글 200자·이모지 200자 허용", async () => {
    const result = await db.from("reviews").insert([
        { order_id: ids[1], rating: 1, text: "" },
        { order_id: ids[2], rating: 5, text: null },
        { order_id: ids[3], rating: 5, text: "가".repeat(200) },
        { order_id: ids[4], rating: 1, text: "😀".repeat(200) },
    ]).select("order_id, rating, text");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(4);
});
test("별점 0·6·NULL·소수와 텍스트 201자 거부", async () => {
    for (const rating of [0, 6]) {
        const result = await db.from("reviews").insert({ order_id: ids[5], rating });
        expect(result.error?.code).toBe("23514");
    }
    const missing = await db.from("reviews").insert({ order_id: ids[5], rating: null });
    expect(missing.error?.code).toBe("23502");
    const fractional = await db.from("reviews").insert({ order_id: ids[5], rating: 1.5 });
    expect(fractional.error?.code).toBe("22P02");
    for (const text of ["가".repeat(201), "😀".repeat(201)]) {
        const result = await db.from("reviews").insert({ order_id: ids[5], rating: 3, text });
        expect(result.error?.code).toBe("23514");
    }
    const rows = await db.from("reviews").select("order_id").eq("order_id", ids[5]);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
});
test("같은 주문의 동시 제출은 한 건만 저장하고 기존 후기 유지", async () => {
    const results = await Promise.all([2, 5].map((rating) => db.from("reviews").insert({ order_id: ids[6], rating })));
    expect(results.filter((row) => row.error === null)).toHaveLength(1);
    expect(results.find((row) => row.error)?.error?.code).toBe("23505");
    const saved = await db.from("reviews").select("rating").eq("order_id", ids[6]).single();
    expect(saved.error).toBeNull();
    const duplicate = await db.from("reviews").insert({ order_id: ids[6], rating: 1 });
    expect(duplicate.error?.code).toBe("23505");
    const unchanged = await db.from("reviews").select("rating").eq("order_id", ids[6]).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual(saved.data);
});
test("완료 외 6개 상태와 없는 주문 거부, 후기의 주문 변경에도 완료 조건 적용", async () => {
    for (const id of ids.slice(12)) {
        const result = await db.from("reviews").insert({ order_id: id, rating: 4 });
        expect(result.error?.code).toBe("23514");
    }
    const missing = await db.from("reviews").insert({ order_id: randomUUID(), rating: 4 });
    expect(missing.error?.code).toBe("23503");
    const reassigned = await db.from("reviews").update({ order_id: ids[12] }).eq("order_id", ids[0]);
    expect(reassigned.error?.code).toBe("23514");
});
test("anon 조회·쓰기 거부, authenticated 조회만 허용", async () => {
    const anonymousRead = await anon.from("reviews").select("*").eq("order_id", ids[0]);
    expect(anonymousRead.error?.code).toBe("42501");
    const adminRead = await admin.from("reviews").select("order_id, rating").eq("order_id", ids[0]).single();
    expect(adminRead.error).toBeNull();
    expect(adminRead.data).toEqual({ order_id: ids[0], rating: 4 });
    for (const client of [anon, admin]) {
        const insert = await client.from("reviews").insert({ order_id: ids[7], rating: 5 });
        const update = await client.from("reviews").update({ rating: 1 }).eq("order_id", ids[0]);
        const remove = await client.from("reviews").delete().eq("order_id", ids[0]);
        expect(insert.error?.code).toBe("42501");
        expect(update.error?.code).toBe("42501");
        expect(remove.error?.code).toBe("42501");
    }
    const unchanged = await db.from("reviews").select("rating").eq("order_id", ids[0]).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data?.rating).toBe(4);
});
test("주문 파기 시 후기 함께 삭제", async () => {
    const inserted = await db.from("reviews").insert({ order_id: ids[8], rating: 3, text: "후기" });
    expect(inserted.error).toBeNull();
    const removed = await db.from("orders").delete().eq("id", ids[8]);
    expect(removed.error).toBeNull();
    const rows = await db.from("reviews").select("*").eq("order_id", ids[8]);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
});
