import type { OrderStatus, PaymentMethod, RefundChannel, TransitionAction } from "@/domain/order/status";

// 지금은 상태 전환(T-14)에 필요한 필드만 둔다. 다른 서비스 Task가 필요한 필드·메서드를 추가한다.
export type OrderForTransition = {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
};

// DB 함수 transition_order 인자와 1:1 (Architecture "DB 함수" 표).
export type TransitionCommand = {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  action: TransitionAction;
  actorType: "admin" | "system";
  actorId: string | null;
  reason: string | null;
  refundChannel: RefundChannel | null;
};

export interface OrderRepository {
  findById(id: string): Promise<OrderForTransition | null>;
  // CAS 실패 시 AppError("STATE_CHANGED")를 던진다.
  transition(command: TransitionCommand): Promise<OrderForTransition>;
}
