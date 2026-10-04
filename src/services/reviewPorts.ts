import type { OrderStatus } from "@/domain/order/status";
import type { SubmitReviewResponse } from "@/lib/dto/review";

export interface ReviewRepository {
    findOrderByToken(token: string): Promise<{ id: string; status: OrderStatus } | null>;
    insert(input: { orderId: string; rating: number; text: string | null }): Promise<SubmitReviewResponse>;
}
