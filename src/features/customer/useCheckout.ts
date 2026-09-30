"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
import type { PaymentMethod } from "@/domain/order/status";
import { postOrderWithRetry } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { CreateOrderRequestSchema, type CreateOrderResponse } from "@/lib/dto/order";
import { isPaymentMethodEnabled } from "./paymentMethods";
import { useCart, type CartItem } from "./useCart";

// DECISIONS #23: 멱등키는 결제 화면 진입 시 만들어 sessionStorage에 두고, 주문 성공 시 장바구니와 함께 폐기한다.
// 실패·새로고침·수동 재시도 동안에는 같은 키를 쓴다 — 서버가 이미 만든 주문이면 그 주문을 돌려준다(F-08).
export const IDEMPOTENCY_STORAGE_KEY = "checkout-idempotency-key";

const IdempotencyKeySchema = z.uuid();

function readStoredKey(): string | null {
    try {
        return window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
    } catch {
        return null;
    }
}

function getOrCreateIdempotencyKey(): string {
    const stored = readStoredKey();
    if (stored && IdempotencyKeySchema.safeParse(stored).success) return stored;
    const key = crypto.randomUUID();
    try {
        window.sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, key);
    } catch {
        // 저장할 수 없으면 이 화면에 있는 동안만 같은 키를 쓴다(keyRef).
    }
    return key;
}

function discardIdempotencyKey(): void {
    try {
        window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
    } catch {
        // 저장소 접근이 막힌 환경 — 지울 것도 없다.
    }
}

export type CheckoutError =
    | { kind: "network" }
    | { kind: "server" }
    | { kind: "rateLimited" }
    | { kind: "outOfStock"; shortages: { menuItemId: string; name: string; available: number }[] }
    | { kind: "menuUnavailable"; names: string[] }
    | { kind: "invalidOption"; names: string[] }
    | { kind: "invalidOrder" }
    | { kind: "unknown" };

const ShortagesSchema = z.array(z.object({ menuItemId: z.string(), available: z.int().nonnegative() }));
const MenuRefSchema = z.object({ menuItemId: z.string() });

function menuName(items: readonly CartItem[], menuItemId: string): string | undefined {
    return items.find((item) => item.menuItemId === menuItemId)?.name;
}

function namesFromDetails(details: unknown, items: readonly CartItem[]): string[] {
    const parsed = MenuRefSchema.safeParse(details);
    const name = parsed.success ? menuName(items, parsed.data.menuItemId) : undefined;
    return name ? [name] : [];
}

// Architecture 8절 결제 화면 오류 처리. 자동 재시도(네트워크·타임아웃·5xx)는 postOrderWithRetry가 이미 했다.
function toCheckoutError(error: unknown, items: readonly CartItem[]): CheckoutError {
    if (!(error instanceof AppError)) return { kind: "unknown" };
    if (error.status === 0) return { kind: "network" };
    if (error.status >= 500) return { kind: "server" };
    switch (error.code) {
        case "RATE_LIMITED":
            return { kind: "rateLimited" };
        case "OUT_OF_STOCK": {
            const parsed = ShortagesSchema.safeParse(error.details);
            const shortages = (parsed.success ? parsed.data : []).flatMap((shortage) => {
                const name = menuName(items, shortage.menuItemId);
                return name ? [{ menuItemId: shortage.menuItemId, name, available: shortage.available }] : [];
            });
            return { kind: "outOfStock", shortages };
        }
        case "MENU_UNAVAILABLE":
            return { kind: "menuUnavailable", names: namesFromDetails(error.details, items) };
        case "INVALID_OPTION":
            return { kind: "invalidOption", names: namesFromDetails(error.details, items) };
        case "VALIDATION_ERROR":
            return { kind: "invalidOrder" };
        default:
            return { kind: "unknown" };
    }
}

export interface UseCheckoutResult {
    paymentMethod: PaymentMethod | null;
    selectPaymentMethod: (method: PaymentMethod) => void;
    submitting: boolean;
    succeeded: boolean;
    error: CheckoutError | null;
    canSubmit: boolean;
    submit: () => Promise<void>;
}

export function useCheckout(options: { onSuccess: (order: CreateOrderResponse) => void }): UseCheckoutResult {
    const itemCount = useCart((state) => state.items.length);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [succeeded, setSucceeded] = useState(false);
    const [error, setError] = useState<CheckoutError | null>(null);
    const keyRef = useRef<string | null>(null);
    const inFlightRef = useRef(false);
    const onSuccessRef = useRef(options.onSuccess);

    useEffect(() => {
        onSuccessRef.current = options.onSuccess;
    }, [options.onSuccess]);

    useEffect(() => {
        keyRef.current = getOrCreateIdempotencyKey();
    }, []);

    const submit = useCallback(async () => {
        const items = useCart.getState().items;
        if (inFlightRef.current || succeeded || !paymentMethod || items.length === 0) return;

        keyRef.current ??= getOrCreateIdempotencyKey();
        const request = CreateOrderRequestSchema.safeParse({
            idempotencyKey: keyRef.current,
            paymentMethod,
            locale: DEFAULT_LOCALE,
            items: items.map((item) => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                optionIds: item.options.map((option) => option.id),
            })),
        });
        if (!request.success) {
            setError({ kind: "invalidOrder" });
            return;
        }

        inFlightRef.current = true;
        setSubmitting(true);
        setError(null);
        try {
            const order = await postOrderWithRetry(request.data);
            setSucceeded(true);
            setSubmitting(false);
            discardIdempotencyKey();
            keyRef.current = null;
            useCart.getState().clear();
            onSuccessRef.current(order);
        } catch (caught) {
            setError(toCheckoutError(caught, items));
            setSubmitting(false);
        } finally {
            inFlightRef.current = false;
        }
    }, [paymentMethod, succeeded]);

    // 화면이 막아도 받지 않는 결제수단은 선택되지 않게 한 번 더 막는다(P1 현금만).
    const selectPaymentMethod = useCallback((method: PaymentMethod) => {
        if (isPaymentMethodEnabled(method)) setPaymentMethod(method);
    }, []);

    return {
        paymentMethod,
        selectPaymentMethod,
        submitting,
        succeeded,
        error,
        canSubmit: paymentMethod !== null && itemCount > 0 && !submitting && !succeeded,
        submit,
    };
}
