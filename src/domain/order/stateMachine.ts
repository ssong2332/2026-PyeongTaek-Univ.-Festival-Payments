import type {
    OrderStatus,
    PaymentMethod,
    TransitionAction,
} from "./status";

export interface OrderActionContext {
    status: OrderStatus;
    paymentMethod: PaymentMethod;
}

export function availableActions(order: OrderActionContext): TransitionAction[] {
    switch (order.status) {
        case "pending":
            if (order.paymentMethod === "transfer") {
                return ["confirm_payment", "cancel"];
            }
            return ["confirm_cash", "cancel"];
        case "paid":
            return ["start_cooking", "cancel"];
        case "cooking":
            return ["complete", "refund"];
        case "completed":
        case "cancelled":
        case "refunded":
        case "expired":
        default:
            return [];
    }
}
