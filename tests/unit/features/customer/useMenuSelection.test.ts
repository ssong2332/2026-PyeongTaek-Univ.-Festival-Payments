// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMenuSelection } from "@/features/customer/useMenuSelection";
import { lineIdOf, type CartItem } from "@/features/customer/useCart";
import type { MenuItemDto, MenuOptionGroupDto } from "@/lib/dto/menu";

const MENU = "22222222-2222-2222-2222-222222222222";
const SUGAR = "aaaaaaaa-0000-0000-0000-000000000001";
const LOW = "aaaaaaaa-0000-0000-0000-00000000000a";
const HIGH = "aaaaaaaa-0000-0000-0000-00000000000b";
const TOPPING = "bbbbbbbb-0000-0000-0000-000000000001";
const NUTS = "bbbbbbbb-0000-0000-0000-00000000000a";

const sugar: MenuOptionGroupDto = {
    id: SUGAR,
    name: "설탕 양",
    minSelect: 1,
    maxSelect: 1,
    options: [{ id: LOW, name: "적게", extraPrice: 0 }, { id: HIGH, name: "많이", extraPrice: 500 }],
};
const topping: MenuOptionGroupDto = {
    id: TOPPING,
    name: "추가 옵션",
    minSelect: 0,
    maxSelect: 3,
    options: [{ id: NUTS, name: "견과류 추가", extraPrice: 500 }],
};

function menu(overrides: Partial<MenuItemDto> = {}): MenuItemDto {
    return {
        id: MENU,
        name: "치즈 호떡",
        description: null,
        price: 2500,
        stock: 5,
        isRecommended: false,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: null,
        optionGroups: [topping],
        ...overrides,
    };
}

function inCart(quantity: number, optionIds: string[] = []): CartItem {
    return { lineId: lineIdOf(MENU, optionIds), menuItemId: MENU, name: "치즈 호떡", unitPrice: 2500, quantity, options: [] };
}

describe("useMenuSelection — 메뉴 상세 시트 상태", () => {
    it("옵션 선택·수량 2 → 담기 가능, 금액과 장바구니 입력값에 옵션 추가 가격 반영 (F-03)", () => {
        const { result } = renderHook(() => useMenuSelection(menu(), []));
        expect(result.current.total).toBe(2500);
        act(() => result.current.toggle(TOPPING, NUTS));
        act(() => result.current.setQuantity(2));
        expect(result.current.selectedIds).toEqual([NUTS]);
        expect(result.current.total).toBe(6000);
        expect(result.current.canAdd).toBe(true);
        expect(result.current.message).toBeNull();
        expect(result.current.cartInput()).toEqual({
            menuItemId: MENU,
            name: "치즈 호떡",
            unitPrice: 2500,
            quantity: 2,
            options: [{ id: NUTS, groupName: "추가 옵션", name: "견과류 추가", extraPrice: 500 }],
        });
    });

    it("필수 옵션을 고르기 전에는 담을 수 없고 이유를 알려준다", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ optionGroups: [sugar] }), []));
        expect(result.current.canAdd).toBe(false);
        expect(result.current.message).toBe("‘설탕 양’을(를) 골라 주세요.");
        act(() => result.current.toggle(SUGAR, HIGH));
        expect(result.current.canAdd).toBe(true);
        expect(result.current.total).toBe(3000);
    });

    it("F-02: 수량 상한은 재고 − 장바구니에 담긴 같은 메뉴 수량", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ stock: 5 }), [inCart(3, [NUTS])]));
        expect(result.current.maxQuantity).toBe(2);
    });

    it("경계: 재고만큼 이미 담았으면 담을 수 없다", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ stock: 3 }), [inCart(3)]));
        expect(result.current.maxQuantity).toBe(0);
        expect(result.current.canAdd).toBe(false);
        expect(result.current.message).toBe("남은 재고만큼 이미 장바구니에 담았어요.");
    });

    it("경계: 옵션을 바꿔 상한이 줄면 수량을 상한으로 맞춘다", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ stock: 200 }), [inCart(95, [NUTS])]));
        act(() => result.current.setQuantity(10));
        expect(result.current.quantity).toBe(10);
        act(() => result.current.toggle(TOPPING, NUTS));
        expect(result.current.maxQuantity).toBe(4);
        expect(result.current.quantity).toBe(4);
        expect(result.current.canAdd).toBe(true);
    });

    it("예외: 팀장 결정 7 — 필수 그룹 선택지가 부족하면 담기 불가", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ optionGroups: [{ ...sugar, options: [] }] }), []));
        expect(result.current.canAdd).toBe(false);
        expect(result.current.message).toBe("지금은 고를 수 있는 옵션이 없어 담을 수 없어요.");
    });

    it("예외: 품절 메뉴는 담기 불가", () => {
        const { result } = renderHook(() => useMenuSelection(menu({ isSoldOut: true, isAvailable: false, stock: 0 }), []));
        expect(result.current.canAdd).toBe(false);
        expect(result.current.message).toBe("품절된 메뉴예요.");
    });

    it("예외: 장바구니가 20가지로 가득 차면 새 조합은 담을 수 없다", () => {
        const full = Array.from({ length: 20 }, (_, i): CartItem => ({
            lineId: `other-${i}`,
            menuItemId: `33333333-3333-3333-3333-${String(i).padStart(12, "0")}`,
            name: "다른 메뉴",
            unitPrice: 1000,
            quantity: 1,
            options: [],
        }));
        const { result } = renderHook(() => useMenuSelection(menu(), full));
        expect(result.current.canAdd).toBe(false);
        expect(result.current.message).toBe("장바구니에는 최대 20가지까지 담을 수 있어요.");
    });
});
