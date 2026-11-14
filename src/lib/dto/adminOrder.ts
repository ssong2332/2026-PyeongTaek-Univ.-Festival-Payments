import { z } from "zod";
import {
    ADMIN_TRANSITION_ACTIONS,
    ORDER_STATUSES,
    PAYMENT_METHODS,
    REFUND_CHANNELS,
    TRANSITION_ACTIONS,
    type OrderStatus,
    type PaymentMethod,
    type RefundChannel,
    type TransitionAction,
} from "@/domain/order/status";

export const AdminOrderItemOptionDtoSchema = z.object({
    nameKo: z.string(),
    extraPrice: z.number().int().nonnegative(),
});
export type AdminOrderItemOptionDto = z.infer<typeof AdminOrderItemOptionDtoSchema>;

export const AdminOrderItemDtoSchema = z.object({
    menuNameKo: z.string(),
    quantity: z.number().int().positive(),
    options: z.array(AdminOrderItemOptionDtoSchema),
    lineTotal: z.number().int().nonnegative(),
});
export type AdminOrderItemDto = z.infer<typeof AdminOrderItemDtoSchema>;

export const AdminOrderDtoSchema = z.object({
    id: z.string().uuid(),
    pickupNumber: z.number().int().positive(),
    status: z.enum(ORDER_STATUSES),
    paymentMethod: z.enum(PAYMENT_METHODS),
    totalAmount: z.number().int().nonnegative(),
    items: z.array(AdminOrderItemDtoSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    acknowledgedAt: z.string().nullable(),
    transferReportedAt: z.string().nullable(),
    cancelRequestedAt: z.string().nullable(),
    cancelRejectedAt: z.string().nullable(),
    paidAt: z.string().nullable(),
    cookingStartedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
    // T-55 되돌리기 (F-49/Architecture): 되돌린 시각 기준 입금 대기 시작 시각 (하위 호환성 유지)
    pendingSince: z.string().nullable().optional(),
    refundChannel: z.enum(REFUND_CHANNELS).nullable(),
    lastReason: z.string().nullable(),
    availableActions: z.array(z.enum(TRANSITION_ACTIONS)),
    // T-28 수기 주문 사후 입력(F-34). 수기 주문이면 source = "manual", manualNumber = 종이의 M 번호(화면은 M-001로 표시),
    // manualOrderedAt = 종이에 적힌 주문 시각. 고객 주문은 "customer"·null·null.
    source: z.enum(["customer", "manual"]).optional(),
    manualNumber: z.number().int().positive().nullable().optional(),
    manualOrderedAt: z.string().nullable().optional(),
});
export type AdminOrderDto = z.infer<typeof AdminOrderDtoSchema>;

export const AdminOrdersResponseSchema = z.object({
    orders: z.array(AdminOrderDtoSchema),
    unacknowledgedCount: z.number().int().nonnegative(),
    // 조리 화면(scope=kitchen)에서만: 조리중 주문 전체 건수. orders.length보다 크면 상한에 걸려 덜 불러온 것이다.
    total: z.number().int().nonnegative().optional(),
});
export type AdminOrdersResponse = z.infer<typeof AdminOrdersResponseSchema>;

export const AdminTransitionRequestSchema = z.object({
    // 공용 TRANSITION_ACTIONS가 아닌 관리자 6종만 허용(auto_complete·expire → 400 VALIDATION_ERROR).
    action: z.enum(ADMIN_TRANSITION_ACTIONS),
    reason: z.string().min(1).max(200).optional(),
    refundChannel: z.enum(REFUND_CHANNELS).optional(),
});
export type AdminTransitionRequest = z.infer<typeof AdminTransitionRequestSchema>;

// POST /api/admin/orders/[id]/cancel-request — 고객 취소 요청의 승인·거절(T-35). 사유는 어느 쪽이든 필수.
// strict: 규격에 없는 필드가 들어오면 400(Architecture 보안 규칙 — 모든 핸들러 zod strict()).
export const AdminCancelRequestDecisionSchema = z.strictObject({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().min(1).max(200),
});
export type AdminCancelRequestDecision = z.infer<typeof AdminCancelRequestDecisionSchema>;

export {
    type OrderStatus,
    type PaymentMethod,
    type RefundChannel,
    type TransitionAction,
};
