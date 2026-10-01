"use client";

import { useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { cartTotal } from "@/domain/order/pricing";
import { MAX_CART_LINES, MAX_ITEM_QUANTITY } from "./menuRules";

// DECISIONS #23: 장바구니는 sessionStorage(zustand persist). 이름·가격은 담을 때의 표시용 사본이고,
// 주문 금액은 서버가 메뉴·옵션 ID로 다시 계산한다(N-03).
export const CART_STORAGE_KEY = "customer-cart";

const CartOptionSchema = z.object({
    id: z.string(),
    groupName: z.string(),
    name: z.string(),
    extraPrice: z.int().nonnegative(),
});
export type CartOption = z.infer<typeof CartOptionSchema>;

const CartItemSchema = z.object({
    lineId: z.string(),
    menuItemId: z.string(),
    name: z.string(),
    unitPrice: z.int().nonnegative(),
    quantity: z.int().min(1).max(MAX_ITEM_QUANTITY),
    options: z.array(CartOptionSchema),
});
export type CartItem = z.infer<typeof CartItemSchema>;

const PersistedCartSchema = z.object({ items: z.array(CartItemSchema).max(MAX_CART_LINES) });

export type AddCartItemInput = Omit<CartItem, "lineId">;

interface CartState {
    items: CartItem[];
    addItem: (input: AddCartItemInput) => boolean;
    update: (lineId: string, quantity: number) => boolean;
    remove: (lineId: string) => void;
    clear: () => void;
}

export function lineIdOf(menuItemId: string, optionIds: readonly string[]): string {
    return `${menuItemId}:${[...optionIds].sort().join(",")}`;
}

function isValidQuantity(quantity: number): boolean {
    return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_ITEM_QUANTITY;
}

const NOOP_STORAGE: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// 서버 렌더링 중이거나 저장소 접근이 막힌 브라우저에서는 저장 없이 동작한다.
function sessionStorageOrNoop(): StateStorage {
    try {
        return window.sessionStorage;
    } catch {
        return NOOP_STORAGE;
    }
}

export const useCart = create<CartState>()(
    persist(
        (set, get) => ({
            items: [],
            addItem: (input) => {
                if (!isValidQuantity(input.quantity)) return false;
                const lineId = lineIdOf(input.menuItemId, input.options.map((option) => option.id));
                const items = get().items;
                const existing = items.find((item) => item.lineId === lineId);
                if (existing) {
                    const quantity = existing.quantity + input.quantity;
                    if (!isValidQuantity(quantity)) return false;
                    set({ items: items.map((item) => (item.lineId === lineId ? { ...item, quantity } : item)) });
                    return true;
                }
                if (items.length >= MAX_CART_LINES) return false;
                set({ items: [...items, { ...input, lineId }] });
                return true;
            },
            update: (lineId, quantity) => {
                const items = get().items;
                if (!isValidQuantity(quantity) || !items.some((item) => item.lineId === lineId)) return false;
                set({ items: items.map((item) => (item.lineId === lineId ? { ...item, quantity } : item)) });
                return true;
            },
            remove: (lineId) => set({ items: get().items.filter((item) => item.lineId !== lineId) }),
            clear: () => set({ items: [] }),
        }),
        {
            name: CART_STORAGE_KEY,
            version: 1,
            storage: createJSONStorage(sessionStorageOrNoop),
            partialize: (state) => ({ items: state.items }),
            // 저장값은 사용자가 바꿀 수 있다 — 규격과 다르면 버리고 빈 장바구니로 시작한다.
            merge: (persisted, current) => {
                const parsed = PersistedCartSchema.safeParse(persisted);
                return { ...current, items: parsed.success ? parsed.data.items : [] };
            },
            // 서버 HTML(빈 장바구니)과 첫 클라이언트 렌더를 맞추기 위해 저장값은 마운트 뒤에 읽는다(useCartHydrated).
            skipHydration: true,
        },
    ),
);

export const selectCartTotal = (state: Pick<CartState, "items">): number => cartTotal(state.items);
export const selectCartCount = (state: Pick<CartState, "items">): number =>
    state.items.reduce((sum, item) => sum + item.quantity, 0);

const subscribeHydration = (onChange: () => void) => useCart.persist.onFinishHydration(onChange);
const getHydrated = () => useCart.persist.hasHydrated();
const getServerHydrated = () => false;

// 저장값을 읽기 전에는 "빈 장바구니"로 판단하지 않도록 화면이 기다리는 신호.
export function useCartHydrated(): boolean {
    const hydrated = useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
    useEffect(() => {
        if (!useCart.persist.hasHydrated()) void useCart.persist.rehydrate();
    }, []);
    return hydrated;
}
