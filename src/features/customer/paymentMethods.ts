import type { PaymentMethod } from "@/domain/order/status";

// 축제 운영은 현금·계좌이체 둘 다 받는다(2026-10-05 결정). 계좌 안내는 주문 완료·현황 보기의 TransferGuide(T-31).
export const ENABLED_PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "transfer"];

export function isPaymentMethodEnabled(method: PaymentMethod): boolean {
    return ENABLED_PAYMENT_METHODS.includes(method);
}
