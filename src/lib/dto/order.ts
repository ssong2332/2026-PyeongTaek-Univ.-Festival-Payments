import { z } from "zod";
import type { OrderStatus } from "@/domain/order/status";

// DB가 만든 ID(메뉴·옵션·주문)는 z.guid()로 검사한다. z.uuid()는 RFC 9562 버전·variant 비트까지 보므로
// Postgres uuid가 받는 값(예: 시드 메뉴 11111111-1111-1111-1111-111111111111)을 거부한다.
// 멱등키는 클라이언트가 crypto.randomUUID()(v4)로 만들므로 z.uuid() 그대로 둔다.

// Architecture "6. 고객 API" POST /api/orders. 가격 필드는 받지 않는다 — strict라 들어오면 400(N-03).
export const CreateOrderRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  paymentMethod: z.enum(["cash", "transfer"]),
  // 지원 언어 목록은 T-04에서 SUPPORTED_LOCALES로 옮긴다.
  locale: z.enum(["ko", "en"]),
  items: z.array(z.strictObject({
    menuItemId: z.guid(),
    quantity: z.int().min(1).max(99),
    optionIds: z.array(z.guid()),
  })).min(1).max(20),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

const ORDER_STATUSES = [
  "pending", "paid", "cooking", "completed", "cancelled", "refunded", "expired",
] as const satisfies readonly OrderStatus[];

// 201 신규 / 200 멱등 재요청(created=false). 값은 전부 DB 함수 create_order 결과(ADR-0002).
// 서버는 응답 전에 이 스키마로 검사하고, 프론트(T-09)는 같은 스키마로 응답을 검사할 수 있다.
export const CreateOrderResponseSchema = z.object({
  orderId: z.guid(),
  pickupNumber: z.int().positive(),
  // 상태 페이지 토큰(F-10) — 64자 16진수
  statusToken: z.string().regex(/^[0-9a-f]{64}$/),
  // 새 주문은 pending. 멱등 재요청이면 그 시점의 현재 상태(예: paid)다.
  status: z.enum(ORDER_STATUSES),
  totalAmount: z.int().nonnegative(),
  // ISO 8601 UTC (Architecture "API 규격 — 공통")
  createdAt: z.iso.datetime(),
  created: z.boolean(),
});

export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;
