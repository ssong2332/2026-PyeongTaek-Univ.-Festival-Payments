import { describe, expect, it } from "vitest";
import { cartTotal, lineTotal } from "@/domain/order/pricing";

// T-06 · F-03 · F-04: 장바구니 합계(표시용). 규칙은 DB order_items와 같다 — line_total = (unit_price + options_price) * quantity.
describe("lineTotal", () => {
    it("옵션 추가 가격을 단가에 더한 뒤 수량을 곱한다", () => {
        expect(lineTotal({ unitPrice: 3000, quantity: 2, options: [{ extraPrice: 500 }] })).toBe(7000);
    });

    it("추가 가격 0원 옵션은 합계를 바꾸지 않는다", () => {
        expect(lineTotal({ unitPrice: 3000, quantity: 1, options: [{ extraPrice: 0 }] })).toBe(3000);
    });

    it("옵션이 없으면 단가 × 수량", () => {
        expect(lineTotal({ unitPrice: 4500, quantity: 3, options: [] })).toBe(13500);
    });

    it("여러 옵션의 추가 가격을 모두 더한다", () => {
        expect(lineTotal({ unitPrice: 2000, quantity: 2, options: [{ extraPrice: 500 }, { extraPrice: 300 }, { extraPrice: 0 }] })).toBe(5600);
    });

    it.each([
        [1, 3500],
        [99, 346500],
    ])("수량 경계 %i개도 그대로 곱한다", (quantity, expected) => {
        expect(lineTotal({ unitPrice: 3000, quantity, options: [{ extraPrice: 500 }] })).toBe(expected);
    });
});

describe("cartTotal", () => {
    it("항목별 합계를 모두 더한다", () => {
        expect(cartTotal([
            { unitPrice: 3000, quantity: 2, options: [{ extraPrice: 500 }] },
            { unitPrice: 4000, quantity: 1, options: [] },
        ])).toBe(11000);
    });

    it("빈 장바구니는 0원", () => {
        expect(cartTotal([])).toBe(0);
    });

    it("가격 0원 메뉴·0원 옵션만 담으면 0원", () => {
        expect(cartTotal([{ unitPrice: 0, quantity: 5, options: [{ extraPrice: 0 }] }])).toBe(0);
    });
});
