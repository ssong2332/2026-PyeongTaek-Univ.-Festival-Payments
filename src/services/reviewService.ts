import { AppError } from "@/lib/api/errors";
import type { SubmitReviewRequest, SubmitReviewResponse } from "@/lib/dto/review";
import type { ReviewRepository } from "@/services/reviewPorts";

export function validateReviewToken(token: string): void {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new AppError("NOT_FOUND", 404);
}
export async function submitReview(
    token: string, input: SubmitReviewRequest, repository: ReviewRepository,
): Promise<SubmitReviewResponse> {
    validateReviewToken(token);
    const order = await repository.findOrderByToken(token);
    if (!order) throw new AppError("NOT_FOUND", 404);
    if (order.status !== "completed") throw new AppError("REVIEW_NOT_ALLOWED", 409);
    // 주문 ID는 요청 본문이 아닌 검증된 토큰 조회 결과에서만 얻는다.
    // INSERT의 PK·완료 주문 트리거가 동시 중복 제출과 상태 변경 경합도 막는다.
    return repository.insert({ orderId: order.id, rating: input.rating, text: input.text ?? null });
}
