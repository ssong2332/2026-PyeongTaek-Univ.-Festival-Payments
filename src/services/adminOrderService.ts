import { availableActions, resolveTransition } from "@/domain/order/stateMachine";
import type { RefundChannel, TransitionAction } from "@/domain/order/status";
import type { AdminOrderRepository, OrderListFilter, OrderForTransition, OrderRepository } from "./ports";
import type { AdminOrderDto, AdminOrdersResponse } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";

export async function listAdminOrders(
    repository: AdminOrderRepository,
    filter?: OrderListFilter,
): Promise<AdminOrdersResponse> {
    const orders = await repository.list(filter);

    const unacknowledgedCount = orders.filter(
        (o) => o.acknowledgedAt === null && ["pending", "paid", "cooking"].includes(o.status),
    ).length;

    return {
        orders,
        unacknowledgedCount,
    };
}

export async function getAdminOrderById(
    repository: AdminOrderRepository,
    id: string,
): Promise<AdminOrderDto> {
    const order = await repository.findById(id);
    if (!order) {
        throw new AppError("NOT_FOUND", 404);
    }
    return order;
}

export async function acknowledgeAdminOrder(
    repository: AdminOrderRepository,
    id: string,
    actorId?: string,
): Promise<AdminOrderDto> {
    const order = await repository.findById(id);
    if (!order) {
        throw new AppError("NOT_FOUND", 404);
    }

    // 이미 확인된 주문이면 기존 주문 반환 (멱등)
    if (order.acknowledgedAt !== null) {
        return order;
    }

    return await repository.acknowledge(id, actorId);
}

export type AdminTransitionInput = {
    orderId: string;
    action: TransitionAction;
    adminId: string;
    reason?: string;
    refundChannel?: RefundChannel;
};

// 상태 머신 실패 코드 → HTTP 상태 (Architecture ErrorCode 표).
const TRANSITION_ERROR_STATUS = {
    INVALID_TRANSITION: 409,
    REASON_REQUIRED: 400,
    REFUND_CHANNEL_REQUIRED: 400,
} as const;

// Architecture "관리자 상태 전환" 흐름. 관리자 인증(requireAdmin)은 Route Handler가 먼저 한다.
export async function transition(
    input: AdminTransitionInput,
    deps: { orderRepository: OrderRepository },
): Promise<OrderForTransition> {
    const order = await deps.orderRepository.findById(input.orderId);
    if (!order) throw new AppError("NOT_FOUND", 404);

    // expire·auto_complete 같은 시스템 전용 동작은 관리자 버튼 목록에 없으므로 거부된다.
    if (!availableActions(order).includes(input.action)) throw new AppError("INVALID_TRANSITION", 409);

    const result = resolveTransition(order, input.action, input);
    if (!result.ok) throw new AppError(result.code, TRANSITION_ERROR_STATUS[result.code]);

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
