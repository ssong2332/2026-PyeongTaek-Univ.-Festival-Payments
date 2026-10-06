import { z } from "zod";

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
