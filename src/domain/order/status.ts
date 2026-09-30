export const ORDER_STATUSES = [
    "pending",
    "paid",
    "cooking",
    "completed",
    "cancelled",
    "refunded",
    "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// T-53 / PR #38: transfer_method 컬럼 및 타입 삭제 (현금/계좌이체 2종만 지원)
export const REFUND_CHANNELS = ["cash", "bank"] as const;
export type RefundChannel = (typeof REFUND_CHANNELS)[number];

export const TRANSITION_ACTIONS = [
    "confirm_payment",
    "confirm_cash",
    "start_cooking",
    "complete",
    "auto_complete",
    "cancel",
    "refund",
    "expire",
] as const;

export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

export const ACTOR_TYPES = ["admin", "system", "customer"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
