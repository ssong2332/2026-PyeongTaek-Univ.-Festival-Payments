export type OrderStatus = "pending" | "paid" | "cooking" | "completed" | "cancelled" | "refunded" | "expired";
export type PaymentMethod = "cash" | "transfer";
export type RefundChannel = "cash" | "bank";
export type TransitionAction = "confirm_payment" | "confirm_cash" | "start_cooking" | "complete" | "auto_complete" | "cancel" | "refund" | "expire";
