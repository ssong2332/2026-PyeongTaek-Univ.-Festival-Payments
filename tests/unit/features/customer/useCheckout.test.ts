// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MY_ORDERS_STORAGE_KEY, readMyOrders } from "@/features/customer/myOrders";
import { IDEMPOTENCY_STORAGE_KEY, useCheckout } from "@/features/customer/useCheckout";
import { useCart } from "@/features/customer/useCart";
import type { CreateOrderResponse } from "@/lib/dto/order";

const MENU_A = "11111111-1111-1111-1111-111111111111";
const MENU_B = "22222222-2222-2222-2222-222222222222";
const NUTS = "bbbbbbbb-0000-0000-0000-00000000000a";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const order: CreateOrderResponse = {
    orderId: "99999999-9999-4999-8999-999999999999",
    pickupNumber: 5,
    statusToken: "a".repeat(64),
    status: "pending",
    totalAmount: 7000,
    createdAt: "2026-10-07T03:00:00.000Z",
    created: true,
};

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const envelope = (code: string, details?: unknown) => ({ error: { code, message: "x", ...(details ? { details } : {}) } });

function hang(_url: string, init?: RequestInit) {
    return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));

function fillCart() {
    useCart.getState().addItem({
        menuItemId: MENU_A,
        name: "치즈 호떡",
        unitPrice: 2500,
        quantity: 2,
        options: [{ id: NUTS, groupName: "추가 옵션", name: "견과류 추가", extraPrice: 500 }],
    });
    useCart.getState().addItem({ menuItemId: MENU_B, name: "기본호떡", unitPrice: 1000, quantity: 1, options: [] });
}

function setup() {
    const onSuccess = vi.fn<(result: CreateOrderResponse) => void>();
    const hook = renderHook(() => useCheckout({ onSuccess }));
    return { ...hook, onSuccess };
}

async function submitAndSettle(result: { current: { submit: () => Promise<void> } }) {
    await act(async () => {
        const pending = result.current.submit();
        await vi.runAllTimersAsync();
        await pending;
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    useCart.setState({ items: [] });
    fillCart();
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("useCheckout — 결제수단·확정 가능 여부 (F-06)", () => {
    it("결제수단을 고르기 전에는 확정할 수 없고, submit해도 요청하지 않는다", async () => {
        const { result } = setup();
        expect(result.current.paymentMethod).toBeNull();
        expect(result.current.canSubmit).toBe(false);
        await submitAndSettle(result);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("장바구니가 비어 있으면 결제수단을 골라도 확정할 수 없다", () => {
        useCart.getState().clear();
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        expect(result.current.canSubmit).toBe(false);
    });

    it("진입 시 멱등키(UUID v4)를 sessionStorage에 만들고, 다시 들어와도(새로고침) 같은 키를 쓴다 (F-08)", () => {
        const first = setup();
        const key = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
        expect(key).toMatch(UUID_V4);
        first.unmount();
        setup();
        expect(sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)).toBe(key);
    });
});

describe("useCheckout.submit — 성공", () => {
    it("현금 선택 후 확정: 장바구니를 옵션 ID·수량으로 보내고, 성공하면 장바구니·키를 폐기하고 onSuccess(주문)", async () => {
        fetchMock.mockResolvedValueOnce(json(201, order));
        const { result, onSuccess } = setup();
        const key = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
        act(() => result.current.selectPaymentMethod("cash"));
        expect(result.current.canSubmit).toBe(true);

        await submitAndSettle(result);

        expect(sentBodies()).toEqual([{
            idempotencyKey: key,
            paymentMethod: "cash",
            locale: "ko",
            items: [
                { menuItemId: MENU_A, quantity: 2, optionIds: [NUTS] },
                { menuItemId: MENU_B, quantity: 1, optionIds: [] },
            ],
        }]);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(order);
        expect(useCart.getState().items).toEqual([]);
        expect(sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)).toBeNull();
        expect(result.current.succeeded).toBe(true);
        expect(result.current.canSubmit).toBe(false);
    });

    it("계좌이체도 고를 수 있고 paymentMethod 'transfer'로 제출한다 (T-31, 2026-10-05 결정)", async () => {
        fetchMock.mockResolvedValueOnce(json(201, order));
        const { result, onSuccess } = setup();
        act(() => result.current.selectPaymentMethod("transfer"));
        expect(result.current.paymentMethod).toBe("transfer");
        expect(result.current.canSubmit).toBe(true);
        await submitAndSettle(result);
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).paymentMethod).toBe("transfer");
        expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("T-10: 첫 요청이 8초 타임아웃 → 같은 멱등키로 자동 재시도 성공 → 주문 1건(onSuccess 1회)", async () => {
        fetchMock.mockImplementationOnce(hang).mockResolvedValueOnce(json(200, { ...order, created: false }));
        const { result, onSuccess } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);

        const bodies = sentBodies();
        expect(bodies).toHaveLength(2);
        expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess.mock.calls[0][0].orderId).toBe(order.orderId);
        expect(result.current.error).toBeNull();
    });
});

describe("useCheckout.submit — 잠금", () => {
    it("요청 중에는 submitting=true, 두 번 눌러도 요청은 1건", async () => {
        let resolve: (response: Response) => void = () => {};
        fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { resolve = r; }));
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));

        let first: Promise<void> = Promise.resolve();
        act(() => {
            first = result.current.submit();
            void result.current.submit();
        });
        expect(result.current.submitting).toBe(true);
        expect(result.current.canSubmit).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolve(json(201, order));
            await first;
        });
        expect(result.current.submitting).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe("useCheckout.submit — 실패", () => {
    it("자동 재시도(총 3회)까지 네트워크 실패면 network 오류, 장바구니·키 유지, 수동 재시도는 같은 키로 성공", async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockRejectedValueOnce(new TypeError("fetch failed"))
            .mockResolvedValueOnce(json(201, order));
        const { result, onSuccess } = setup();
        const key = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
        act(() => result.current.selectPaymentMethod("cash"));

        await submitAndSettle(result);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(result.current.error).toEqual({ kind: "network" });
        expect(result.current.submitting).toBe(false);
        expect(result.current.canSubmit).toBe(true);
        expect(useCart.getState().items).toHaveLength(2);
        expect(sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)).toBe(key);
        expect(onSuccess).not.toHaveBeenCalled();

        await submitAndSettle(result);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(sentBodies()[3].idempotencyKey).toBe(key);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(result.current.error).toBeNull();
    });

    it("5xx가 계속되면 server 오류(수동 재시도 가능)", async () => {
        fetchMock.mockImplementation(async () => json(503, envelope("INTERNAL_ERROR")));
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(result.current.error).toEqual({ kind: "server" });
        expect(useCart.getState().items).toHaveLength(2);
    });

    it("F-47: 429 RATE_LIMITED는 자동 재시도 없이 rateLimited, 장바구니·키 유지", async () => {
        fetchMock.mockResolvedValueOnce(json(429, envelope("RATE_LIMITED", { retryAfterSeconds: 30 })));
        const { result } = setup();
        const key = sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.current.error).toEqual({ kind: "rateLimited" });
        expect(useCart.getState().items).toHaveLength(2);
        expect(sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY)).toBe(key);
    });

    it("OUT_OF_STOCK: details의 메뉴를 장바구니 이름으로 바꿔 부족 항목과 남은 수량을 알려준다", async () => {
        fetchMock.mockResolvedValueOnce(json(409, envelope("OUT_OF_STOCK", [{ menuItemId: MENU_A, requested: 2, available: 1 }])));
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(result.current.error).toEqual({
            kind: "outOfStock",
            shortages: [{ menuItemId: MENU_A, name: "치즈 호떡", available: 1 }],
        });
        expect(useCart.getState().items).toHaveLength(2);
    });

    it("OUT_OF_STOCK details 형식이 다르면 부족 항목 없이 outOfStock", async () => {
        fetchMock.mockResolvedValueOnce(json(409, envelope("OUT_OF_STOCK", { unexpected: true })));
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(result.current.error).toEqual({ kind: "outOfStock", shortages: [] });
    });

    it("MENU_UNAVAILABLE·INVALID_OPTION은 해당 메뉴 이름과 함께 알려준다", async () => {
        fetchMock
            .mockResolvedValueOnce(json(409, envelope("MENU_UNAVAILABLE", { menuItemId: MENU_B })))
            .mockResolvedValueOnce(json(409, envelope("INVALID_OPTION", { menuItemId: MENU_A })));
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(result.current.error).toEqual({ kind: "menuUnavailable", names: ["기본호떡"] });
        await submitAndSettle(result);
        expect(result.current.error).toEqual({ kind: "invalidOption", names: ["치즈 호떡"] });
    });

    it("장바구니가 주문 규격에 맞지 않으면(손상된 ID) 요청하지 않고 invalidOrder", async () => {
        useCart.setState({
            items: [{ lineId: "x", menuItemId: "not-a-uuid", name: "이상한 메뉴", unitPrice: 1000, quantity: 1, options: [] }],
        });
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));
        await submitAndSettle(result);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current.error).toEqual({ kind: "invalidOrder" });
    });
});

describe("useCheckout.submit — 이 기기에 주문 링크 저장 (#89)", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("성공하면 이동(onSuccess) 전에 상태 토큰·픽업 번호를 localStorage에 남긴다", async () => {
        fetchMock.mockResolvedValueOnce(json(201, order));
        let savedWhenNavigating: unknown = "onSuccess 미호출";
        const onSuccess = vi.fn(() => {
            savedWhenNavigating = readMyOrders();
        });
        const { result } = renderHook(() => useCheckout({ onSuccess }));
        act(() => result.current.selectPaymentMethod("cash"));

        await submitAndSettle(result);

        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(savedWhenNavigating).toEqual([{ statusToken: order.statusToken, pickupNumber: 5, savedAt: new Date().toISOString() }]);
    });

    it("멱등 재요청(200, 같은 토큰)으로 다시 성공해도 한 건만 남는다", async () => {
        fetchMock.mockResolvedValueOnce(json(200, { ...order, created: false }));
        localStorage.setItem(
            MY_ORDERS_STORAGE_KEY,
            JSON.stringify([{ statusToken: order.statusToken, pickupNumber: 5, savedAt: new Date(Date.now() - 60_000).toISOString() }]),
        );
        const { result } = setup();
        act(() => result.current.selectPaymentMethod("cash"));

        await submitAndSettle(result);

        expect(readMyOrders().map((saved) => saved.statusToken)).toEqual([order.statusToken]);
    });

    it.each([
        ["네트워크(자동 재시도 3회 실패)", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))],
        ["429 RATE_LIMITED", () => fetchMock.mockResolvedValueOnce(json(429, envelope("RATE_LIMITED", { retryAfterSeconds: 30 })))],
        ["409 OUT_OF_STOCK", () => fetchMock.mockResolvedValueOnce(json(409, envelope("OUT_OF_STOCK", [{ menuItemId: MENU_A, requested: 2, available: 1 }])))],
    ])("실패하면(%s) 아무것도 저장하지 않는다", async (_label, arrange) => {
        arrange();
        const { result, onSuccess } = setup();
        act(() => result.current.selectPaymentMethod("cash"));

        await submitAndSettle(result);

        expect(onSuccess).not.toHaveBeenCalled();
        expect(localStorage.getItem(MY_ORDERS_STORAGE_KEY)).toBeNull();
    });
});
