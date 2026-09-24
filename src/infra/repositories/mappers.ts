import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import type { OrderForTransition } from "@/services/ports";

type OrderRow = { id: string; status: OrderStatus; payment_method: PaymentMethod };

// DB 행 → 서비스 타입. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toOrderForTransition(row: OrderRow): OrderForTransition {
  return { id: row.id, status: row.status, paymentMethod: row.payment_method };
}
