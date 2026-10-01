import type { PaymentMethod } from "@/domain/order/status";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: "현금", transfer: "계좌이체" };
