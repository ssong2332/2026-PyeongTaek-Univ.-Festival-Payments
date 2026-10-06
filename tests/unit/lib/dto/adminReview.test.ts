import { expect, it } from "vitest";
import { AdminReviewsResponseSchema } from "@/lib/dto/review";

const review = {
    orderId: "11111111-1111-4111-8111-111111111111", pickupNumber: 7, manualNumber: null,
    rating: 4, text: "맛있어요", createdAt: "2026-10-07T03:12:00.000Z",
};
const response = { date: "2026-10-07", count: 1, averageRating: 4, reviews: [review] };

it.each([
    response,
    { date: "all", count: 0, averageRating: null, reviews: [] },
    { ...response, reviews: [{ ...review, text: null, rating: 1 }], averageRating: 1 },
    { ...response, reviews: [{ ...review, pickupNumber: 2_100_000_001, manualNumber: 1, rating: 5 }], averageRating: 5 },
])("T-42 관리자 후기 응답 허용: %#", (body) => {
    expect(AdminReviewsResponseSchema.safeParse(body).success).toBe(true);
});

it.each([
    { ...response, reviews: [{ ...review, rating: 0 }] },
    { ...response, reviews: [{ ...review, rating: 6 }] },
    { ...response, reviews: [{ ...review, rating: 4.5 }] },
    { ...response, averageRating: 0.9 },
    { ...response, averageRating: 5.1 },
    { ...response, count: -1 },
    { ...response, reviews: [{ ...review, createdAt: "2026-10-07 12:12" }] },
    { ...response, reviews: [{ ...review, orderId: "not-a-uuid" }] },
    { ...response, reviews: [{ ...review, manualNumber: 0 }] },
    { ...response, reviews: [{ ...review, statusToken: "a".repeat(64) }] },
    { ...response, extra: true },
])("T-42 잘못된 관리자 후기 응답 거부: %#", (body) => {
    expect(AdminReviewsResponseSchema.safeParse(body).success).toBe(false);
});
