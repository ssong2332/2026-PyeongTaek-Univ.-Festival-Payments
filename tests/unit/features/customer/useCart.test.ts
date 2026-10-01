// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    CART_STORAGE_KEY,
    selectCartCount,
    selectCartTotal,
    useCart,
    type AddCartItemInput,
} from "@/features/customer/useCart";

const MENU_A = "11111111-1111-1111-1111-111111111111";
const MENU_B = "22222222-2222-2222-2222-222222222222";
const SUGAR_HIGH = { id: "aaaaaaaa-0000-0000-0000-00000000000b", groupName: "설탕 양", name: "많이", extraPrice: 500 };
const NUTS = { id: "bbbbbbbb-0000-0000-0000-00000000000a", groupName: "토핑", name: "견과류", extraPrice: 0 };

function churros(overrides: Partial<AddCartItemInput> = {}): AddCartItemInput {
    return { menuItemId: MENU_A, name: "츄러스", unitPrice: 3000, quantity: 1, options: [SUGAR_HIGH], ...overrides };
}

const cart = () => useCart.getState();

beforeEach(() => {
    sessionStorage.clear();
    useCart.setState({ items: [] });
});

describe("useCart.addItem", () => {
    it("새 조합을 담으면 항목이 하나 생기고 합계에 옵션 추가 가격이 포함된다 (F-03)", () => {
        expect(cart().addItem(churros({ quantity: 2 }))).toBe(true);
        expect(cart().items).toHaveLength(1);
        expect(cart().items[0]).toMatchObject({ menuItemId: MENU_A, name: "츄러스", quantity: 2, options: [SUGAR_HIGH] });
        expect(selectCartTotal(cart())).toBe(7000);
        expect(selectCartCount(cart())).toBe(2);
    });

    it("같은 메뉴·같은 옵션 조합(순서 무관)은 한 항목으로 합친다", () => {
        cart().addItem(churros({ options: [SUGAR_HIGH, NUTS] }));
        cart().addItem(churros({ quantity: 2, options: [NUTS, SUGAR_HIGH] }));
        expect(cart().items).toHaveLength(1);
        expect(cart().items[0].quantity).toBe(3);
    });

    it("옵션이 다르면 다른 항목이 된다", () => {
        cart().addItem(churros());
        cart().addItem(churros({ options: [] }));
        expect(cart().items).toHaveLength(2);
        expect(selectCartTotal(cart())).toBe(6500);
    });

    it.each([0, -1, 1.5, 100])("수량 %s는 담지 않는다 (1..99만 허용)", (quantity) => {
        expect(cart().addItem(churros({ quantity }))).toBe(false);
        expect(cart().items).toEqual([]);
    });

    it("경계: 합친 수량이 99를 넘으면 거부하고 기존 수량을 유지한다", () => {
        cart().addItem(churros({ quantity: 98 }));
        expect(cart().addItem(churros({ quantity: 1 }))).toBe(true);
        expect(cart().addItem(churros({ quantity: 1 }))).toBe(false);
        expect(cart().items[0].quantity).toBe(99);
    });

    it("경계: 항목이 20개면 새 조합은 거부하지만 기존 항목에 합치는 것은 된다", () => {
        for (let i = 0; i < 20; i++) {
            cart().addItem(churros({ menuItemId: `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`, options: [] }));
        }
        expect(cart().items).toHaveLength(20);
        expect(cart().addItem(churros({ menuItemId: MENU_B, options: [] }))).toBe(false);
        expect(cart().addItem(churros({ menuItemId: "11111111-1111-1111-1111-000000000000", options: [] }))).toBe(true);
        expect(cart().items).toHaveLength(20);
    });
});

describe("useCart.update / remove / clear", () => {
    it("수량을 바꾸면 합계가 다시 계산된다", () => {
        cart().addItem(churros());
        const { lineId } = cart().items[0];
        expect(cart().update(lineId, 4)).toBe(true);
        expect(selectCartTotal(cart())).toBe(14000);
    });

    it.each([0, 100, 2.5])("수량 %s로는 바꾸지 않는다", (quantity) => {
        cart().addItem(churros({ quantity: 2 }));
        const { lineId } = cart().items[0];
        expect(cart().update(lineId, quantity)).toBe(false);
        expect(cart().items[0].quantity).toBe(2);
    });

    it("없는 항목은 바꾸지 않는다", () => {
        cart().addItem(churros());
        expect(cart().update("없는-항목", 3)).toBe(false);
        expect(cart().items[0].quantity).toBe(1);
    });

    it("F-04: 항목 2개 중 하나를 삭제하면 합계가 남은 항목 기준으로 재계산된다", () => {
        cart().addItem(churros());
        cart().addItem({ menuItemId: MENU_B, name: "떡볶이", unitPrice: 4000, quantity: 1, options: [] });
        expect(selectCartTotal(cart())).toBe(7500);
        cart().remove(cart().items[0].lineId);
        expect(cart().items.map((item) => item.name)).toEqual(["떡볶이"]);
        expect(selectCartTotal(cart())).toBe(4000);
    });

    it("clear는 장바구니를 비운다", () => {
        cart().addItem(churros());
        cart().clear();
        expect(cart().items).toEqual([]);
        expect(selectCartTotal(cart())).toBe(0);
    });
});

describe("sessionStorage 유지 (DECISIONS #23)", () => {
    it("담은 항목은 sessionStorage에 저장된다", () => {
        cart().addItem(churros({ quantity: 2 }));
        const stored = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) ?? "null");
        expect(stored.state.items).toHaveLength(1);
        expect(stored.state.items[0]).toMatchObject({ menuItemId: MENU_A, quantity: 2 });
    });

    it("다시 읽으면(새로고침) 저장된 항목이 복원된다", async () => {
        cart().addItem(churros({ quantity: 3 }));
        const saved = sessionStorage.getItem(CART_STORAGE_KEY);
        useCart.setState({ items: [] });
        sessionStorage.setItem(CART_STORAGE_KEY, saved ?? "");
        await useCart.persist.rehydrate();
        expect(cart().items).toHaveLength(1);
        expect(cart().items[0].quantity).toBe(3);
    });

    it("저장값이 규격과 다르면(손상·변조) 빈 장바구니로 시작한다", async () => {
        sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ state: { items: [{ menuItemId: MENU_A, quantity: "많이" }] }, version: 1 }));
        await useCart.persist.rehydrate();
        expect(cart().items).toEqual([]);
    });

    it("useCartHydrated: 첫 렌더는 저장값을 읽기 전(false·빈 장바구니), 마운트 뒤 복원되고 true", async () => {
        cart().addItem(churros({ quantity: 2 }));
        vi.resetModules();
        const fresh = await import("@/features/customer/useCart");
        const seen: { hydrated: boolean; count: number }[] = [];
        const { result } = renderHook(() => {
            const hydrated = fresh.useCartHydrated();
            const count = fresh.useCart(fresh.selectCartCount);
            seen.push({ hydrated, count });
            return hydrated;
        });
        expect(seen[0]).toEqual({ hydrated: false, count: 0 });
        expect(result.current).toBe(true);
        expect(seen.at(-1)).toEqual({ hydrated: true, count: 2 });
        act(() => {
            fresh.useCart.getState().clear();
        });
        expect(result.current).toBe(true);
    });
});
