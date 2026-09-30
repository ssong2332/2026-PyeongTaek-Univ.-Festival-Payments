// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartSummary, type CartLineView } from "@/components/customer/CartSummary";
import { OrderSummary } from "@/components/customer/OrderSummary";
import { PaymentMethodPicker } from "@/components/customer/PaymentMethodPicker";

afterEach(cleanup);

const line = (overrides: Partial<CartLineView> = {}): CartLineView => ({
    lineId: "a",
    name: "치즈 호떡",
    optionSummary: "견과류 추가",
    quantity: 2,
    maxQuantity: 5,
    lineTotal: 6000,
    imageUrl: null,
    warning: null,
    ...overrides,
});

describe("CartSummary — 장바구니 항목", () => {
    it("이름·옵션·수량·줄 금액을 보이고, 수량 변경·삭제를 lineId로 알린다 (F-04)", () => {
        const onQuantityChange = vi.fn();
        const onRemove = vi.fn();
        render(<CartSummary lines={[line()]} onQuantityChange={onQuantityChange} onRemove={onRemove} />);
        const item = screen.getByRole("listitem");
        expect(item.textContent).toContain("치즈 호떡");
        expect(item.textContent).toContain("견과류 추가");
        expect(item.textContent).toContain("6,000원");
        fireEvent.click(within(item).getByRole("button", { name: "수량 늘리기" }));
        expect(onQuantityChange).toHaveBeenCalledWith("a", 3);
        fireEvent.click(within(item).getByRole("button", { name: "치즈 호떡 삭제" }));
        expect(onRemove).toHaveBeenCalledWith("a");
    });

    it("경고가 있는 항목은 경고 문구를 함께 보인다(품절 등)", () => {
        render(<CartSummary lines={[line({ warning: "품절된 메뉴예요. 삭제해 주세요." })]} onQuantityChange={() => {}} onRemove={() => {}} />);
        expect(screen.getByRole("listitem").textContent).toContain("품절된 메뉴예요. 삭제해 주세요.");
    });

    it("경계: 수량이 상한이면 늘리기 비활성", () => {
        render(<CartSummary lines={[line({ quantity: 5, maxQuantity: 5 })]} onQuantityChange={() => {}} onRemove={() => {}} />);
        expect((screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement).disabled).toBe(true);
    });
});

describe("OrderSummary — 주문 내역", () => {
    it("항목 × 수량, 금액, 합계", () => {
        render(<OrderSummary lines={[line(), line({ lineId: "b", name: "기본호떡", optionSummary: "", quantity: 1, lineTotal: 2000 })]} total={8000} />);
        const summary = screen.getByRole("region", { name: "주문 내역" });
        expect(summary.textContent).toContain("치즈 호떡 × 2");
        expect(summary.textContent).toContain("기본호떡 × 1");
        expect(summary.textContent).toContain("8,000원");
    });
});

describe("PaymentMethodPicker — 결제 방법 (F-06)", () => {
    it("현금·계좌이체 두 가지, 처음엔 아무것도 선택되지 않음", () => {
        render(<PaymentMethodPicker value={null} onChange={() => {}} />);
        const radios = screen.getAllByRole("radio") as HTMLInputElement[];
        expect(radios.map((radio) => radio.checked)).toEqual([false, false]);
        expect(screen.getByRole("radiogroup", { name: "결제 방법" })).toBeTruthy();
    });

    it("선택하면 onChange('cash'|'transfer')", () => {
        const onChange = vi.fn();
        render(<PaymentMethodPicker value={null} onChange={onChange} />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(screen.getByRole("radio", { name: "계좌이체" }));
        expect(onChange.mock.calls).toEqual([["cash"], ["transfer"]]);
    });

    it("현금이면 '부스에서 현금으로 결제해 주세요.' 안내만, 계좌이체면 안내 없음", () => {
        const { rerender } = render(<PaymentMethodPicker value="cash" onChange={() => {}} />);
        expect(screen.getByText("부스에서 현금으로 결제해 주세요.")).toBeTruthy();
        expect(document.body.textContent).not.toContain("거스름돈");
        rerender(<PaymentMethodPicker value="transfer" onChange={() => {}} />);
        expect(screen.queryByText("부스에서 현금으로 결제해 주세요.")).toBeNull();
    });

    it("제출 중에는 바꿀 수 없다", () => {
        render(<PaymentMethodPicker value="cash" onChange={() => {}} disabled />);
        expect((screen.getAllByRole("radio") as HTMLInputElement[]).every((radio) => radio.disabled)).toBe(true);
    });
});
