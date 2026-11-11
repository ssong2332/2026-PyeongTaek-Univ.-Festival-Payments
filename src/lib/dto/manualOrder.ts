import { z } from "zod";
import { MANUAL_NUMBER_MAX } from "@/domain/order/manualNumber";
import { PAYMENT_METHODS } from "@/domain/order/status";

// T-28 수기 주문 사후 입력(F-34, DECISIONS #62). POST /api/admin/manual-orders.
// 가격은 받지 않는다 — 서버가 DB의 메뉴·옵션 가격으로 계산한다(N-03). strict라 규격에 없는 필드는 400.

export const ManualOrderRequestSchema = z.strictObject({
    idempotencyKey: z.uuid(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    // 종이에 적힌 주문 시각. 오프셋(Z 또는 +09:00)이 있는 ISO 8601만 받는다.
    manualOrderedAt: z.iso.datetime({ offset: true }),
    // 종이에 적힌 M 번호의 숫자 부분(M-001 → 1). 자동 발급하지 않는다 — 중복은 DB가 막는다(409 MANUAL_NUMBER_TAKEN).
    manualNumber: z.int().min(1).max(MANUAL_NUMBER_MAX),
    items: z.array(z.strictObject({
        menuItemId: z.guid(),
        quantity: z.int().min(1).max(99),
        optionIds: z.array(z.guid()),
    })).min(1).max(20),
});
export type ManualOrderRequest = z.infer<typeof ManualOrderRequestSchema>;

// 201 신규 / 200 멱등 재요청(created=false). 값은 전부 DB 함수 create_manual_order 결과.
export const ManualOrderResponseSchema = z.object({
    orderId: z.guid(),
    manualNumber: z.int().min(1).max(MANUAL_NUMBER_MAX),
    // "M-001"
    displayNumber: z.string(),
    status: z.literal("completed"),
    paymentMethod: z.enum(PAYMENT_METHODS),
    totalAmount: z.int().nonnegative(),
    manualOrderedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    created: z.boolean(),
    // 저장 시점에 재고가 모자랐던 메뉴(저장은 됨, 재고는 0에서 멈춤). 재요청(created=false)이면 빈 배열.
    stockShortages: z.array(z.object({
        menuItemId: z.guid(),
        requested: z.int().positive(),
        available: z.int().nonnegative(),
    })),
});
export type ManualOrderResponse = z.infer<typeof ManualOrderResponseSchema>;
