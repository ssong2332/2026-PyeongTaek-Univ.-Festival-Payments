import { availableActions, resolveTransition } from "@/domain/order/stateMachine";
import type { RefundChannel, TransitionAction } from "@/domain/order/status";
import { kstDate } from "@/domain/time/kst";
import type { AdminOrderRepository, Clock, OrderListFilter, OrderForTransition, OrderRepository } from "./ports";
import type { AdminOrderDto, AdminOrdersResponse } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";

const systemClock: Clock = { now: () => new Date() };

// Architecture 관리자 API 표: `date` 기본 오늘(KST), `pickupNumber`가 있으면 date 무시.
// 오늘은 서버 시각(clock)으로 계산한다 — 런타임이 UTC라 로컬 시간대를 쓰면 00:00~09:00 KST에 전날이 된다.
export async function listAdminOrders(
    repository: AdminOrderRepository,
    filter?: OrderListFilter,
    clock: Clock = systemClock,
): Promise<AdminOrdersResponse> {
    const effectiveFilter = filter?.pickupNumber !== undefined
        ? { ...filter, date: undefined }
        : filter?.date
            ? filter
            : { ...filter, date: kstDate(clock.now().toISOString()) };
    const orders = await repository.list(effectiveFilter);

    const unacknowledgedCount = orders.filter(
        (o) => o.acknowledgedAt === null && ["pending", "paid", "cooking"].includes(o.status),
    ).length;

    return {
        orders,
        unacknowledgedCount,
    };
}

export async function getAdminOrderById(
    repository: Pick<AdminOrderRepository, "findById">,
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
    deps: { orderRepository: Pick<OrderRepository, "findById" | "transition"> },
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

export type CancelRequestDecisionInput = {
    orderId: string;
    decision: "approve" | "reject";
    reason: string;
    adminId: string;
};

// Architecture "POST /api/admin/orders/{id}/cancel-request" · PRD F-18 (T-35). 관리자 인증은 Route Handler가 먼저 한다.
// 승인 = 관리자 취소(transition의 cancel)와 같은 처리, 거절 = 상태를 그대로 두고 거절 시각 + 이력.
export async function resolveCancelRequest(
    input: CancelRequestDecisionInput,
    deps: {
        adminOrderRepository: Pick<AdminOrderRepository, "findById">;
        orderRepository: Pick<OrderRepository, "findById" | "transition" | "rejectCancelRequest">;
    },
): Promise<AdminOrderDto> {
    const order = await getAdminOrderById(deps.adminOrderRepository, input.orderId);

    // 요청이 없거나, 이미 거절됐거나, 조리가 시작된 주문은 승인·거절 대상이 아니다.
    const resolvable =
        (order.status === "pending" || order.status === "paid") &&
        order.cancelRequestedAt !== null &&
        order.cancelRejectedAt === null;
    if (!resolvable) throw new AppError("INVALID_TRANSITION", 409);

    const reason = input.reason.trim();
    if (!reason) throw new AppError("REASON_REQUIRED", 400);

    if (input.decision === "approve") {
        await transition(
            { orderId: order.id, action: "cancel", adminId: input.adminId, reason },
            { orderRepository: deps.orderRepository },
        );
    } else {
        // 위 조회는 사전 확인일 뿐이고, 최종 판단은 저장소의 조건부 갱신이 한다(동시에 처리한 다른 관리자).
        const rejected = await deps.orderRepository.rejectCancelRequest(order.id, input.adminId, reason);
        if (!rejected) throw new AppError("INVALID_TRANSITION", 409);
    }

    return getAdminOrderById(deps.adminOrderRepository, order.id);
}
