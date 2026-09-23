export type OrderStatus = "pending" | "paid" | "cooking" | "completed" | "cancelled" | "refunded" | "expired";
export type PaymentMethod = "cash" | "transfer";
export type TransferMethod = "bank" | "kakaopay" | "toss";
export type RefundChannel = "cash" | TransferMethod;
export type TransitionAction = "confirm_payment" | "confirm_cash" | "start_cooking" | "complete" | "auto_complete" | "cancel" | "refund" | "expire";
