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
    refundChannel: z.enum(REFUND_CHANNELS).nullable(),
    lastReason: z.string().nullable(),
    availableActions: z.array(z.enum(TRANSITION_ACTIONS)),
});
export type AdminOrderDto = z.infer<typeof AdminOrderDtoSchema>;

export const AdminOrdersResponseSchema = z.object({
    orders: z.array(AdminOrderDtoSchema),
    unacknowledgedCount: z.number().int().nonnegative(),
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
export const AdminCancelRequestDecisionSchema = z.object({
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
