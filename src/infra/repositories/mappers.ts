import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import { CreateOrderResponseSchema, type CreateOrderResponse } from "@/lib/dto/order";
import type { OrderForTransition } from "@/services/ports";

type OrderRow = { id: string; status: OrderStatus; payment_method: PaymentMethod };

// DB 행 → 서비스 타입. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toOrderForTransition(row: OrderRow): OrderForTransition {
  return { id: row.id, status: row.status, paymentMethod: row.payment_method };
}

// DB 시각(+09:00 등) → UTC ISO 문자열. 해석할 수 없으면 원래 값을 두어 스키마 검사에서 걸리게 한다.
function toUtcIso(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

// DB 결과 → API DTO. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
// 모양 검사는 프론트와 같은 계약(CreateOrderResponseSchema)으로 한다. 어긋나면 일반 Error → 500(내용 비노출).
export function toCreateOrderResponse(data: unknown): CreateOrderResponse {
  const row = (data ?? {}) as Record<string, unknown>;
  const parsed = CreateOrderResponseSchema.safeParse({
    orderId: row.orderId,
    pickupNumber: row.pickupNumber,
    statusToken: row.statusToken,
    status: row.status,
    totalAmount: row.totalAmount,
    createdAt: toUtcIso(row.createdAt),
    created: row.created,
  });
  if (!parsed.success) throw new Error("create_order returned an unexpected shape");
  return parsed.data;
}

type OrderResponseRow = {
  id: string;
  pickup_number: number;
  status_token: string;
  status: string;
  total_amount: number;
  created_at: string;
};

// 멱등키 선조회 결과(orders 행) → 기존 주문 응답(created=false).
export function toExistingOrderResponse(row: OrderResponseRow): CreateOrderResponse {
  return toCreateOrderResponse({
    orderId: row.id,
    pickupNumber: row.pickup_number,
    statusToken: row.status_token,
    status: row.status,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    created: false,
  });
}
