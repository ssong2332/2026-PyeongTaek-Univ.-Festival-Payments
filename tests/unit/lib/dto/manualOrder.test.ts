import { describe, expect, test } from "vitest";
import { formatManualNumber } from "@/domain/order/manualNumber";
import { ManualOrderRequestSchema } from "@/lib/dto/manualOrder";

// T-28 POST /api/admin/manual-orders 요청 규격(F-34, DECISIONS #62).
const valid = {
    idempotencyKey: "3f0e7b3a-5c1d-4e6f-8a9b-0c1d2e3f4a5b",
    paymentMethod: "cash",
    manualOrderedAt: "2026-10-07T03:00:00.000Z",
    manualNumber: 1,
    items: [{ menuItemId: "11111111-1111-1111-1111-111111111111", quantity: 2, optionIds: [] }],
};
const ok = (input: unknown) => ManualOrderRequestSchema.safeParse(input).success;

describe("ManualOrderRequestSchema", () => {
    test("정상 요청을 받는다 — 시드 형식 메뉴 ID와 +09:00 시각 포함", () => {
        expect(ok(valid)).toBe(true);
        expect(ok({ ...valid, paymentMethod: "transfer", manualOrderedAt: "2026-10-07T12:00:00+09:00" })).toBe(true);
    });

    test.each([
        ["가격 필드", { ...valid, totalAmount: 1 }],
        ["규격에 없는 필드", { ...valid, unexpected: true }],
        ["항목의 가격 필드", { ...valid, items: [{ ...valid.items[0], unitPrice: 1 }] }],
    ])("%s가 들어오면 거부한다(strict)", (_name, input) => {
        expect(ok(input)).toBe(false);
    });

    test.each([0, -1, 1.5, 10_000, "1", null, undefined])("수기 번호 %s 는 거부한다(1..9999 정수만)", (manualNumber) => {
        expect(ok({ ...valid, manualNumber })).toBe(false);
    });

    test.each([1, 999, 9999])("수기 번호 %s 는 받는다", (manualNumber) => {
        expect(ok({ ...valid, manualNumber })).toBe(true);
    });

    test.each(["2026-10-07 12:00", "2026-10-07T12:00:00", "", null])("시각 %s 는 거부한다(오프셋 있는 ISO만)", (manualOrderedAt) => {
        expect(ok({ ...valid, manualOrderedAt })).toBe(false);
    });

    test("항목은 1~20줄, 수량은 1~99, 결제수단은 현금·계좌이체만", () => {
        expect(ok({ ...valid, items: [] })).toBe(false);
        expect(ok({ ...valid, items: Array.from({ length: 21 }, () => valid.items[0]) })).toBe(false);
        expect(ok({ ...valid, items: [{ ...valid.items[0], quantity: 0 }] })).toBe(false);
        expect(ok({ ...valid, items: [{ ...valid.items[0], quantity: 100 }] })).toBe(false);
        expect(ok({ ...valid, paymentMethod: "kakaopay" })).toBe(false);
        expect(ok({ ...valid, idempotencyKey: "not-a-uuid" })).toBe(false);
    });
});

describe("formatManualNumber", () => {
    test.each([[1, "M-001"], [42, "M-042"], [999, "M-999"], [1000, "M-1000"]])("%s → %s", (value, label) => {
        expect(formatManualNumber(value)).toBe(label);
    });
});
