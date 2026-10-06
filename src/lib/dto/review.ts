import { z } from "zod";
import { MANUAL_NUMBER_MAX } from "@/domain/order/manualNumber";

// Postgres char_length와 같은 Unicode code point 기준. 이모지도 한 글자로 센다.
export const SubmitReviewRequestSchema = z.strictObject({
    rating: z.int().min(1).max(5),
    text: z.string().refine((text) => Array.from(text).length <= 200, {
        message: "Review text must be at most 200 characters.",
    }).nullable().optional(),
});
export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequestSchema>;
export const SubmitReviewResponseSchema = z.strictObject({ createdAt: z.iso.datetime() });
export type SubmitReviewResponse = z.infer<typeof SubmitReviewResponseSchema>;

// GET /api/admin/reviews(T-42, F-37). 텍스트는 고객 자유 입력이라 관리자 응답에만 싣고 로그에 남기지 않는다.
export const AdminReviewDtoSchema = z.strictObject({
    orderId: z.guid(),
    pickupNumber: z.int().positive(),
    // 수기 주문(T-28)이면 종이의 M 번호(화면 "M-001"), 고객 주문은 null.
    manualNumber: z.int().min(1).max(MANUAL_NUMBER_MAX).nullable(),
    rating: z.int().min(1).max(5),
    text: z.string().nullable(),
    createdAt: z.iso.datetime(),
});
export type AdminReviewDto = z.infer<typeof AdminReviewDtoSchema>;
export const AdminReviewsResponseSchema = z.strictObject({
    date: z.string(),
    count: z.int().nonnegative(),
    // 소수 첫째 자리 반올림, 0건이면 null(domain/review/summary).
    averageRating: z.number().min(1).max(5).nullable(),
    reviews: z.array(AdminReviewDtoSchema),
});
export type AdminReviewsResponse = z.infer<typeof AdminReviewsResponseSchema>;
