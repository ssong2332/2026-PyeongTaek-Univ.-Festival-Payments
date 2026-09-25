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

export const TRANSFER_METHODS = ["bank", "kakaopay", "toss"] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];

export const REFUND_CHANNELS = ["cash", "bank", "kakaopay", "toss"] as const;
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
