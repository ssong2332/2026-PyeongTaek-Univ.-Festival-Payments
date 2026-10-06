import type { OrderStatus } from "@/domain/order/status";
import type { AdminReviewDto, SubmitReviewResponse } from "@/lib/dto/review";

export interface ReviewRepository {
    findOrderByToken(token: string): Promise<{ id: string; status: OrderStatus } | null>;
    insert(input: { orderId: string; rating: number; text: string | null }): Promise<SubmitReviewResponse>;
}

// T-42 관리자 열람. range는 후기 작성 시각의 UTC [start, end), null이면 전체 기간. 최신 후기부터.
export interface AdminReviewRepository {
    listForAdmin(range: { start: string; end: string } | null): Promise<AdminReviewDto[]>;
}
