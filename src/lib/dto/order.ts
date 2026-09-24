import { z } from "zod";

// Architecture "6. 고객 API" POST /api/orders. 가격 필드는 받지 않는다 — strict라 들어오면 400(N-03).
export const CreateOrderRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  paymentMethod: z.enum(["cash", "transfer"]),
  // 지원 언어 목록은 T-04에서 SUPPORTED_LOCALES로 옮긴다.
  locale: z.enum(["ko", "en"]),
  items: z.array(z.strictObject({
    menuItemId: z.uuid(),
    quantity: z.int().min(1).max(99),
    optionIds: z.array(z.uuid()),
  })).min(1).max(20),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

// 201 신규 / 200 멱등 재요청(created=false). 값은 전부 DB 함수 create_order 결과(ADR-0002).
export type CreateOrderResponse = {
  orderId: string;
  pickupNumber: number;
  statusToken: string;
  status: "pending";
  totalAmount: number;
  createdAt: string;
  created: boolean;
};
