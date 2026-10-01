import type { PaymentMethod } from "@/domain/order/status";

// P1은 현금만 받는다(Tasks T-31: 송금 안내가 P2). 계좌이체는 주문 완료 화면의 계좌 안내(T-31)가 생길 때 여기에 다시 넣는다.
export const ENABLED_PAYMENT_METHODS: readonly PaymentMethod[] = ["cash"];

export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
    return ENABLED_PAYMENT_METHODS.includes(method);
}
