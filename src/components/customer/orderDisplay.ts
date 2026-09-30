import type { PaymentMethod } from "@/domain/order/status";

// feat/T-05-customer-order-flow의 lib/format.ts formatWon과 같은 출력 — 병합 때 그쪽으로 합친다.
export function formatWon(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: "현금", transfer: "계좌이체" };
