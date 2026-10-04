import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { POST } from "@/app/api/orders/[token]/reviews/route";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseReviewRepository } from "@/infra/repositories/supabaseReviewRepository";

const db = createServiceClient();
const incomplete = ["pending", "paid", "cooking", "cancelled", "refunded", "expired"];
const orders = Array.from({ length: 14 }, (_, index) => ({
    id: randomUUID(), status_token: randomBytes(32).toString("hex"),
    status: index < 8 ? "completed" : incomplete[index - 8],
}));
const pickupBase = randomInt(1_000_000_000, 2_000_000_000);
beforeAll(async () => {
    const result = await db.from("orders").insert(orders.map((order, index) => ({
        ...order, pickup_number: pickupBase + index, payment_method: "cash",
        total_amount: 3000, idempotency_key: randomUUID(),
    })));
    if (result.error) throw result.error;
});
afterAll(async () => {
    const result = await db.from("orders").delete().in("id", orders.map((order) => order.id));
    if (result.error) throw result.error;
});
async function post(token: string, body: unknown, raw = false) {
    const response = await POST(new Request(`http://localhost/api/orders/${token}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: raw ? String(body) : JSON.stringify(body),
    }), { params: Promise.resolve({ token }) });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    return { status: response.status, json: await response.json() };
}
async function saved(index: number) {
    const result = await db.from("reviews").select("order_id, rating, text, created_at").eq("order_id", orders[index].id);
    expect(result.error).toBeNull();
    return result.data!;
}
test("완료 주문의 토큰으로 저장하고 주문의 상태·금액은 유지", async () => {
    const result = await post(orders[0].status_token, { rating: 4, text: "맛있어요" });
    expect(result.status).toBe(201);
    expect(Object.keys(result.json)).toEqual(["createdAt"]);
    expect(result.json.createdAt).toMatch(/Z$/);
    expect(await saved(0)).toEqual([{ order_id: orders[0].id, rating: 4, text: "맛있어요", created_at: expect.any(String) }]);
    expect(new Date((await saved(0))[0].created_at).toISOString()).toBe(result.json.createdAt);
    const unchanged = await db.from("orders").select("status, total_amount").eq("id", orders[0].id).single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual({ status: "completed", total_amount: 3000 });
});
test("별점 경계·선택 텍스트 생략/NULL/빈 값·한글/이모지 200자 허용", async () => {
    const inputs = [{ rating: 1 }, { rating: 5, text: null }, { rating: 4, text: "" }, { rating: 4, text: "가".repeat(200) }, { rating: 4, text: "😀".repeat(200) }];
    for (const [index, input] of inputs.entries()) {
        expect((await post(orders[index + 1].status_token, input)).status).toBe(201);
        expect((await saved(index + 1))[0]).toMatchObject({ rating: input.rating, text: input.text ?? null });
    }
});
test("없는 토큰과 잘못된 토큰은 같은 404이며 입력의 주문 ID로 다른 주문 접근 불가", async () => {
    for (const token of [randomBytes(32).toString("hex"), "z".repeat(64), "a".repeat(63)]) {
        expect(await post(token, { rating: 4 })).toEqual({ status: 404, json: { error: { code: "NOT_FOUND", message: "Resource not found." } } });
    }
    const injected = await post(orders[6].status_token, { rating: 4, orderId: orders[0].id });
    expect(injected.status).toBe(400);
    expect(injected.json.error.code).toBe("VALIDATION_ERROR");
    expect(await saved(6)).toEqual([]);
});
test("잘못된 별점·201자·타입·추가 필드·깨진 JSON 거부, 저장 없음", async () => {
    const inputs = [null, [], {}, { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: "4" }, { rating: null }, { rating: 4, text: 1 }, { rating: 4, text: "가".repeat(201) }, { rating: 4, text: "😀".repeat(201) }, { rating: 4, statusToken: orders[0].status_token }];
    for (const input of inputs) {
        const result = await post(orders[6].status_token, input);
        expect(result.status).toBe(400);
        expect(result.json.error.code).toBe("VALIDATION_ERROR");
        expect(result.json.error.details).toBeUndefined();
    }
    expect((await post(orders[6].status_token, "{", true)).status).toBe(400);
    expect(await saved(6)).toEqual([]);
});
test("완료 외 모든 상태는 API에서 거부하고 저장 없음", async () => {
    for (let index = 8; index < orders.length; index++) {
        const result = await post(orders[index].status_token, { rating: 4 });
        expect(result.status).toBe(409);
        expect(result.json.error.code).toBe("REVIEW_NOT_ALLOWED");
        expect(await saved(index)).toEqual([]);
    }
});
test("조회 후 상태 변경 경합은 DB 트리거에서 409, 주문 파기 경합은 404", async () => {
    const repo = createSupabaseReviewRepository(db);
    expect(await repo.findOrderByToken(orders[7].status_token)).toEqual({ id: orders[7].id, status: "completed" });
    const changed = await db.from("orders").update({ status: "refunded" }).eq("id", orders[7].id);
    expect(changed.error).toBeNull();
    await expect(repo.insert({ orderId: orders[7].id, rating: 4, text: null })).rejects.toMatchObject({ code: "REVIEW_NOT_ALLOWED", status: 409 });
    expect(await saved(7)).toEqual([]);
    await expect(repo.insert({ orderId: randomUUID(), rating: 4, text: null })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});
test("동시 제출은 201 하나·409 하나, 재제출해도 원래 내용·시각 유지", async () => {
    const results = await Promise.all([1, 5].map((rating) => post(orders[6].status_token, { rating })));
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.json.error.code).toBe("REVIEW_ALREADY_SUBMITTED");
    const original = await saved(6);
    expect(original).toHaveLength(1);
    const replay = await post(orders[6].status_token, { rating: 3, text: "덮어쓰기" });
    expect(replay.status).toBe(409);
    expect(replay.json.error.code).toBe("REVIEW_ALREADY_SUBMITTED");
    expect(await saved(6)).toEqual(original);
});
