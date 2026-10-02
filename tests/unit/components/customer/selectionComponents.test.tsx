// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuDetailSheet, type MenuDetailSheetProps } from "@/components/customer/MenuDetailSheet";
import { OptionSelector, type OptionGroupView } from "@/components/customer/OptionSelector";
import { QuantityStepper } from "@/components/customer/QuantityStepper";

afterEach(cleanup);

const sugar: OptionGroupView = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "설탕 양",
    minSelect: 1,
    maxSelect: 1,
    hint: "필수 · 1개 선택",
    options: [
        { id: "aaaaaaaa-0000-0000-0000-00000000000a", name: "적게", extraPrice: 0 },
        { id: "aaaaaaaa-0000-0000-0000-00000000000b", name: "많이", extraPrice: 500 },
    ],
};
const topping: OptionGroupView = {
    id: "bbbbbbbb-0000-0000-0000-000000000001",
    name: "추가 옵션",
    minSelect: 0,
    maxSelect: 2,
    hint: "최대 2개 선택",
    options: [
        { id: "bbbbbbbb-0000-0000-0000-00000000000a", name: "흑설탕 시럽 추가", extraPrice: 300 },
        { id: "bbbbbbbb-0000-0000-0000-00000000000b", name: "견과류 추가", extraPrice: 500 },
        { id: "bbbbbbbb-0000-0000-0000-00000000000c", name: "시나몬", extraPrice: 0 },
    ],
};

describe("OptionSelector", () => {
    it("그룹명·안내·옵션명·추가 가격(+₩, 0원은 무료)을 보인다", () => {
        render(<OptionSelector groups={[topping]} selectedIds={[]} onToggle={() => {}} />);
        const group = screen.getByRole("group", { name: "추가 옵션" });
        expect(group.textContent).toContain("최대 2개 선택");
        expect(group.textContent).toContain("+₩300");
        expect(group.textContent).toContain("무료");
    });

    it("필수 단일 그룹은 라디오, 선택하면 onToggle(그룹, 옵션)", () => {
        const onToggle = vi.fn();
        render(<OptionSelector groups={[sugar]} selectedIds={[]} onToggle={onToggle} />);
        const radio = screen.getByRole("radio", { name: /많이/ });
        fireEvent.click(radio);
        expect(onToggle).toHaveBeenCalledWith(sugar.id, sugar.options[1].id);
    });

    it("복수 그룹은 체크박스, 선택된 것은 checked", () => {
        render(<OptionSelector groups={[topping]} selectedIds={[topping.options[1].id]} onToggle={() => {}} />);
        expect((screen.getByRole("checkbox", { name: /견과류 추가/ }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole("checkbox", { name: /시나몬/ }) as HTMLInputElement).checked).toBe(false);
    });

    it("경계: maxSelect만큼 고르면 나머지는 비활성, 고른 것은 해제 가능", () => {
        const onToggle = vi.fn();
        render(<OptionSelector groups={[topping]} selectedIds={[topping.options[0].id, topping.options[1].id]} onToggle={onToggle} />);
        expect((screen.getByRole("checkbox", { name: /시나몬/ }) as HTMLInputElement).disabled).toBe(true);
        const nuts = screen.getByRole("checkbox", { name: /견과류 추가/ }) as HTMLInputElement;
        expect(nuts.disabled).toBe(false);
        fireEvent.click(nuts);
        expect(onToggle).toHaveBeenCalledWith(topping.id, topping.options[1].id);
    });

    it("그룹이 없으면 아무것도 그리지 않는다", () => {
        const { container } = render(<OptionSelector groups={[]} selectedIds={[]} onToggle={() => {}} />);
        expect(container.textContent).toBe("");
    });
});

describe("QuantityStepper", () => {
    it("+를 누르면 value+1, −를 누르면 value−1", () => {
        const onChange = vi.fn();
        render(<QuantityStepper value={2} max={5} onChange={onChange} />);
        fireEvent.click(screen.getByRole("button", { name: "수량 늘리기" }));
        fireEvent.click(screen.getByRole("button", { name: "수량 줄이기" }));
        expect(onChange.mock.calls).toEqual([[3], [1]]);
        expect(screen.getByRole("group", { name: "수량" }).textContent).toContain("2");
    });

    it("경계: 1이면 − 비활성, 상한이면 + 비활성 (F-02 수량 0 이하 불가·재고 상한)", () => {
        const { rerender } = render(<QuantityStepper value={1} max={5} onChange={() => {}} />);
        expect((screen.getByRole("button", { name: "수량 줄이기" }) as HTMLButtonElement).disabled).toBe(true);
        rerender(<QuantityStepper value={5} max={5} onChange={() => {}} />);
        expect((screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "수량 줄이기" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("예외: 상한이 0이면 + 비활성, 상한보다 많으면 줄이기만 된다", () => {
        const { rerender } = render(<QuantityStepper value={1} max={0} onChange={() => {}} />);
        expect((screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement).disabled).toBe(true);
        rerender(<QuantityStepper value={4} max={2} onChange={() => {}} />);
        expect((screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "수량 줄이기" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("라벨을 바꿀 수 있다(장바구니 항목별)", () => {
        render(<QuantityStepper value={1} max={3} onChange={() => {}} label="치즈 호떡 수량" />);
        expect(screen.getByRole("group", { name: "치즈 호떡 수량" })).toBeTruthy();
    });
});

describe("MenuDetailSheet", () => {
    function props(overrides: Partial<MenuDetailSheetProps> = {}): MenuDetailSheetProps {
        return {
            name: "치즈 호떡",
            description: "녹진한 모짜렐라 치즈",
            price: 2500,
            imageUrl: null,
            groups: [topping],
            selectedIds: [],
            onToggleOption: vi.fn(),
            quantity: 1,
            maxQuantity: 5,
            onQuantityChange: vi.fn(),
            total: 2500,
            canAdd: true,
            message: null,
            onAdd: vi.fn(),
            onClose: vi.fn(),
            ...overrides,
        };
    }

    it("대화상자로 이름·가격·설명·옵션·수량을 보이고, 담기 버튼에 금액", () => {
        const p = props({ total: 6000 });
        render(<MenuDetailSheet {...p} />);
        const dialog = screen.getByRole("dialog", { name: "치즈 호떡" });
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.textContent).toContain("2,500원");
        expect(dialog.textContent).toContain("녹진한 모짜렐라 치즈");
        expect(within(dialog).getByRole("group", { name: "추가 옵션" })).toBeTruthy();
        const add = within(dialog).getByRole("button", { name: /담기/ });
        expect(add.textContent).toContain("6,000원");
        fireEvent.click(add);
        expect(p.onAdd).toHaveBeenCalledTimes(1);
    });

    it("담을 수 없으면 버튼 비활성 + 이유 문구", () => {
        const p = props({ canAdd: false, message: "‘설탕 양’을(를) 골라 주세요." });
        render(<MenuDetailSheet {...p} />);
        const add = screen.getByRole("button", { name: /담기/ }) as HTMLButtonElement;
        expect(add.disabled).toBe(true);
        expect(screen.getByText("‘설탕 양’을(를) 골라 주세요.")).toBeTruthy();
        fireEvent.click(add);
        expect(p.onAdd).not.toHaveBeenCalled();
    });

    it("닫기 버튼·Esc·바깥(배경)을 누르면 onClose", () => {
        const p = props();
        render(<MenuDetailSheet {...p} />);
        fireEvent.click(screen.getByRole("button", { name: "닫기" }));
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
        fireEvent.click(screen.getByTestId("sheet-backdrop"));
        expect(p.onClose).toHaveBeenCalledTimes(3);
    });

    it("열리면 닫기 버튼에 초점이 간다(키보드 사용자)", () => {
        render(<MenuDetailSheet {...props()} />);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "닫기" }));
    });
});
