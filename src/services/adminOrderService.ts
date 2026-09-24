import { availableActions, resolveTransition } from "@/domain/order/stateMachine";
import type { RefundChannel, TransitionAction } from "@/domain/order/status";
import { AppError } from "@/lib/api/errors";
import type { OrderForTransition, OrderRepository } from "./ports";

export type AdminTransitionInput = {
  orderId: string;
  action: TransitionAction;
  adminId: string;
  reason?: string;
  refundChannel?: RefundChannel;
};

// Architecture "관리자 상태 전환" 흐름. 관리자 인증(requireAdmin)은 Route Handler가 먼저 한다.
export async function transition(
  input: AdminTransitionInput,
  deps: { orderRepository: Pick<OrderRepository, "findById" | "transition"> },
): Promise<OrderForTransition> {
  const order = await deps.orderRepository.findById(input.orderId);
  if (!order) throw new AppError("NOT_FOUND");

  // expire·auto_complete 같은 시스템 전용 동작은 관리자 버튼 목록에 없으므로 거부된다.
  if (!availableActions(order).includes(input.action)) throw new AppError("INVALID_TRANSITION");

  const result = resolveTransition(order, input.action, input);
  if (!result.ok) throw new AppError(result.code);

  return deps.orderRepository.transition({
    orderId: order.id,
    from: order.status,
    to: result.to,
    action: input.action,
    actorType: "admin",
    actorId: input.adminId,
    reason: result.needsReason ? input.reason!.trim() : null,
    refundChannel: result.needsRefundChannel ? input.refundChannel! : null,
  });
}
