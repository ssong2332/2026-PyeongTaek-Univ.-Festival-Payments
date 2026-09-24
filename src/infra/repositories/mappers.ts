import type { CreateOrderResponse } from "@/lib/dto/order";

// DB 결과 → API DTO. 스프레드 금지, 필드 명시 나열(Architecture "DTO ↔ 도메인 변환 위치").
export function toCreateOrderResponse(data: unknown): CreateOrderResponse {
  const row = (data ?? {}) as Record<string, unknown>;
  const createdAt = typeof row.createdAt === "string" ? new Date(row.createdAt) : null;
  if (
    typeof row.orderId !== "string"
    || typeof row.pickupNumber !== "number"
    || typeof row.statusToken !== "string"
    || row.status !== "pending"
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
