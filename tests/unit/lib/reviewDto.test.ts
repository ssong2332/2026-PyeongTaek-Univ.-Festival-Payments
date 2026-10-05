import { expect, it } from "vitest";
import { SubmitReviewRequestSchema } from "@/lib/dto/review";

it.each([{ rating: 1 }, { rating: 5, text: null }, { rating: 4, text: "" }, { rating: 4, text: "가".repeat(200) }, { rating: 4, text: "😀".repeat(200) }])("별점·선택 텍스트 경계 허용: %#", (body) => {
    expect(SubmitReviewRequestSchema.safeParse(body).success).toBe(true);
});
it.each([{}, null, [], { rating: 0 }, { rating: 6 }, { rating: 1.5 }, { rating: "4" }, { rating: null }, { rating: 4, text: 1 }, { rating: 4, text: "가".repeat(201) }, { rating: 4, text: "😀".repeat(201) }, { rating: 4, orderId: "spoofed" }, { rating: 4, statusToken: "spoofed" }])("잘못된 입력·주문 ID 주입 거부: %#", (body) => {
    expect(SubmitReviewRequestSchema.safeParse(body).success).toBe(false);
});
