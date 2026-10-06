import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSupabaseAdminReviewRepository } from "@/infra/repositories/supabaseReviewRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { listAdminReviews } from "@/services/adminReviewService";

// T-42 관리자 후기 열람: 저장소 → 서비스를 실제 DB로 확인한다(동작을 바꾸는 mock 없음 — DECISIONS #46).
// 관리자 인증(401)·Cache-Control은 Route Handler 경계라 단위 테스트(tests/unit/api/adminReviewsRoute.test.ts)가 맡는다.
// 다른 테스트의 후기와 섞이지 않게 후기 시각을 2099년으로 넣는다.
const db = createServiceClient();
const repository = createSupabaseAdminReviewRepository(db);
const ids: string[] = Array.from({ length: 5 }, () => randomUUID());
const pickupBase = randomInt(1_000_000_000, 2_000_000_000);
const manualNumber = randomInt(9_000, 10_000);

const reviews = [
    // KST 2099-03-02 00:00:00.000 — 하루 시작(포함)
    { order_id: ids[0], rating: 5, text: "맛있어요 😀", created_at: "2099-03-01T15:00:00.000Z" },
    // KST 2099-03-02 23:59:59.999 — 하루 끝(포함)
    { order_id: ids[1], rating: 4, text: null, created_at: "2099-03-02T14:59:59.999Z" },
    // KST 2099-03-01 23:59:59.999 — 전날
    { order_id: ids[2], rating: 1, text: "전날 후기", created_at: "2099-03-01T14:59:59.999Z" },
    // KST 2099-03-03 00:00:00.000 — 다음 날
    { order_id: ids[3], rating: 2, text: "다음 날 후기", created_at: "2099-03-02T15:00:00.000Z" },
    // 수기 주문(T-28) — 픽업 번호 대신 M 번호
    { order_id: ids[4], rating: 4, text: "", created_at: "2099-03-02T03:00:00.000Z" },
];

beforeAll(async () => {
    // 여러 행 insert는 행마다 빠진 열을 기본값이 아닌 NULL로 보내므로 모든 행에 같은 열을 채운다.
    const orders = await db.from("orders").insert(ids.map((id, index) => ({
        id, status: "completed", payment_method: "cash", total_amount: 3000,
        idempotency_key: randomUUID(), status_token: randomUUID().replaceAll("-", "").repeat(2),
        ...(index === 4
            ? { pickup_number: 2_100_000_000 + manualNumber, source: "manual", manual_number: manualNumber,
                manual_ordered_at: "2099-03-02T02:50:00.000Z" }
            : { pickup_number: pickupBase + index, source: "customer", manual_number: null, manual_ordered_at: null }),
    })));
    if (orders.error) throw orders.error;
    const inserted = await db.from("reviews").insert(reviews);
    if (inserted.error) throw inserted.error;
});
afterAll(async () => {
    const deleted = await db.from("orders").delete().in("id", ids);
    if (deleted.error) throw deleted.error;
});

const dto = (index: number) => ({
    orderId: ids[index],
    pickupNumber: index === 4 ? 2_100_000_000 + manualNumber : pickupBase + index,
    manualNumber: index === 4 ? manualNumber : null,
    rating: reviews[index].rating,
    text: reviews[index].text,
    createdAt: reviews[index].created_at,
});

test("KST 하루 경계로 거르고 최신순 목록·별점 평균·수기 번호를 돌려준다", async () => {
    expect(await listAdminReviews("2099-03-02", repository)).toEqual({
        date: "2099-03-02", count: 3, averageRating: 4.3, reviews: [dto(1), dto(4), dto(0)],
    });
    expect(await listAdminReviews("2099-03-01", repository)).toEqual({
        date: "2099-03-01", count: 1, averageRating: 1, reviews: [dto(2)],
    });
});

test("후기가 없는 날은 0건·평균 null", async () => {
    expect(await listAdminReviews("2099-03-05", repository)).toEqual({
        date: "2099-03-05", count: 0, averageRating: null, reviews: [],
    });
});

test("all은 날짜 제한 없이 작성 시각 내림차순으로 모두 돌려준다", async () => {
    const all = await listAdminReviews("all", repository);
    const mine = all.reviews.filter(review => ids.includes(review.orderId));
    expect(mine).toEqual([dto(3), dto(1), dto(4), dto(0), dto(2)]);
    expect(all.count).toBe(all.reviews.length);
});

test("주문이 지워지면 후기도 목록에서 사라진다(ON DELETE CASCADE)", async () => {
    const extra = randomUUID();
    const order = await db.from("orders").insert({
        id: extra, status: "completed", payment_method: "cash", total_amount: 3000, pickup_number: pickupBase + 10,
        idempotency_key: randomUUID(), status_token: randomUUID().replaceAll("-", "").repeat(2),
    });
    if (order.error) throw order.error;
    const review = await db.from("reviews").insert({ order_id: extra, rating: 3, created_at: "2099-03-04T03:00:00.000Z" });
    if (review.error) throw review.error;
    expect((await listAdminReviews("2099-03-04", repository)).count).toBe(1);
    const deleted = await db.from("orders").delete().eq("id", extra);
    if (deleted.error) throw deleted.error;
    expect(await listAdminReviews("2099-03-04", repository)).toEqual({
        date: "2099-03-04", count: 0, averageRating: null, reviews: [],
    });
});
