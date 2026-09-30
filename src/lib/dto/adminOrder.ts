import { z } from "zod";
import {
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

export {
    type OrderStatus,
    type PaymentMethod,
    type RefundChannel,
    type TransitionAction,
};
