import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

const db = createServiceClient();
const ids = [randomUUID(), randomUUID()];
const prefix = `t38-${randomUUID()}`;
let userId: string | undefined;
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const anon = createClient(url, key, { auth });
const admin = createClient(url, key, { auth });

beforeAll(async () => {
    const inserted = await db.from("menu_items").insert(ids.map((id) => ({ id, base_price: 3000, stock: 5 })));
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
    const removed = await db.from("menu_items").delete().in("id", ids);
    if (removed.error) throw removed.error;
    if (userId) {
        const removedUser = await db.auth.admin.deleteUser(userId);
        if (removedUser.error) throw removedUser.error;
    }
});

test("기존 시드 메뉴와 추천 값을 생략한 신규 메뉴는 false", async () => {
    const rows = await db.from("menu_items").select("id, is_recommended");
    expect(rows.error).toBeNull();
    expect(rows.data!.length).toBeGreaterThan(ids.length);
    expect(rows.data!.every((row) => row.is_recommended === false)).toBe(true);
});

test("추천 ON/OFF는 가격·재고·활성·수동 품절 상태를 보존", async () => {
    for (const recommended of [true, false]) {
        const changed = await db.from("menu_items").update({ is_recommended: recommended }).eq("id", ids[0])
            .select("is_recommended, base_price, stock, is_active, is_sold_out_manual").single();
        expect(changed.error).toBeNull();
        expect(changed.data).toEqual({
            is_recommended: recommended, base_price: 3000, stock: 5, is_active: true, is_sold_out_manual: false,
        });
    }
});

test("추천 메뉴는 여러 개 또는 0개를 허용", async () => {
    const enabled = await db.from("menu_items").update({ is_recommended: true }).in("id", ids);
    expect(enabled.error).toBeNull();
    const recommended = await db.from("menu_items").select("id").in("id", ids).eq("is_recommended", true);
    expect(recommended.error).toBeNull();
    expect(recommended.data).toHaveLength(2);
    const disabled = await db.from("menu_items").update({ is_recommended: false }).in("id", ids);
    expect(disabled.error).toBeNull();
    const empty = await db.from("menu_items").select("id").in("id", ids).eq("is_recommended", true);
    expect(empty.error).toBeNull();
    expect(empty.data).toEqual([]);
});

test("NULL은 신규 등록과 수정 모두 거부하고 기존 값을 유지", async () => {
    const invalid = await db.from("menu_items").insert({ id: ids[0], base_price: 1000, is_recommended: null });
    expect(invalid.error?.code).toBe("23502");
    const update = await db.from("menu_items").update({ is_recommended: null }).eq("id", ids[0]);
    expect(update.error?.code).toBe("23502");
    const row = await db.from("menu_items").select("is_recommended").eq("id", ids[0]).single();
    expect(row.error).toBeNull();
    expect(row.data?.is_recommended).toBe(false);
});

test("anon 조회·변경 및 authenticated 직접 변경은 거부, 관리자 조회는 허용", async () => {
    const anonymousRead = await anon.from("menu_items").select("id, is_recommended").eq("id", ids[0]);
    expect(anonymousRead.error?.code).toBe("42501");
    const adminRead = await admin.from("menu_items").select("id, is_recommended").eq("id", ids[0]).single();
    expect(adminRead.error).toBeNull();
    expect(adminRead.data).toEqual({ id: ids[0], is_recommended: false });
    for (const client of [anon, admin]) {
        const update = await client.from("menu_items").update({ is_recommended: true }).eq("id", ids[0]);
        expect(update.error?.code).toBe("42501");
    }
    const row = await db.from("menu_items").select("is_recommended").eq("id", ids[0]).single();
    expect(row.error).toBeNull();
    expect(row.data?.is_recommended).toBe(false);
});
