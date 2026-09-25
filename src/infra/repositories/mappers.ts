import type { OrderStatus } from "@/domain/order/status";
import type { CreateOrderResponse } from "@/lib/dto/order";

const ORDER_STATUSES: readonly OrderStatus[] = ["pending", "paid", "cooking", "completed", "cancelled", "refunded", "expired"];

function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

// DB 결과 → API DTO. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toCreateOrderResponse(data: unknown): CreateOrderResponse {
  const row = (data ?? {}) as Record<string, unknown>;
  const createdAt = typeof row.createdAt === "string" ? new Date(row.createdAt) : null;
  if (
    typeof row.orderId !== "string"
    || typeof row.pickupNumber !== "number"
    || typeof row.statusToken !== "string"
    || !isOrderStatus(row.status)
    || typeof row.totalAmount !== "number"
    || !createdAt || Number.isNaN(createdAt.getTime())
    || typeof row.created !== "boolean"
  ) {
    throw new Error("create_order returned an unexpected shape");
  }
  return {
    orderId: row.orderId,
    pickupNumber: row.pickupNumber,
    statusToken: row.statusToken,
    status: row.status,
    totalAmount: row.totalAmount,
    createdAt: createdAt.toISOString(),
    created: row.created,
  };
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
