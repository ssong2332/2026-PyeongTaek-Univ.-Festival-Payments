// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutPage from "@/app/(customer)/checkout/page";
import { MY_ORDERS_STORAGE_KEY } from "@/features/customer/myOrders";
import { useCart } from "@/features/customer/useCart";
import type { CreateOrderResponse } from "@/lib/dto/order";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CHEESE = "22222222-2222-2222-2222-222222222222";
const PLAIN = "11111111-1111-1111-1111-111111111111";
const order: CreateOrderResponse = {
    orderId: "99999999-9999-4999-8999-999999999999",
    pickupNumber: 5,
    statusToken: "ab".repeat(32),
    status: "pending",
    totalAmount: 8000,
    createdAt: "2026-10-07T03:00:00.000Z",
    created: true,
};

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const envelope = (code: string, details?: unknown) => ({ error: { code, message: "x", ...(details ? { details } : {}) } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function fillCart() {
    useCart.getState().addItem({
        menuItemId: CHEESE,
        name: "치즈 호떡",
        unitPrice: 2500,
        quantity: 2,
        options: [{ id: "bbbbbbbb-0000-0000-0000-00000000000a", groupName: "추가 옵션", name: "견과류 추가", extraPrice: 500 }],
    });
    useCart.getState().addItem({ menuItemId: PLAIN, name: "기본호떡", unitPrice: 2000, quantity: 1, options: [] });
}

beforeEach(() => {
    fetchMock.mockReset();
    Object.values(router).forEach((fn) => fn.mockReset());
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    localStorage.clear();
    useCart.setState({ items: [] });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const confirmButton = () => screen.getByRole("button", { name: /주문하기|결제 방법을 선택해 주세요/ }) as HTMLButtonElement;

describe("결제수단 선택 / 주문 확정(/checkout) — PRD 화면 표 113행", () => {
    it("빈 값(F-06): 결제수단 미선택이면 확정 비활성, 이름·요청사항 입력칸 없음(팀장 결정)", async () => {
        fillCart();
        render(<CheckoutPage />);
        expect(await screen.findByRole("heading", { name: "주문 정보" })).toBeTruthy();
        expect(confirmButton().disabled).toBe(true);
        expect(confirmButton().textContent).toBe("결제 방법을 선택해 주세요.");
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(document.body.textContent).not.toContain("거스름돈");
        const summary = screen.getByRole("region", { name: "주문 내역" });
        expect(summary.textContent).toContain("치즈 호떡 × 2");
        expect(summary.textContent).toContain("8,000원");
    });

    it("현금 선택: 안내 문구 + '8,000원 주문하기' 활성", () => {
        fillCart();
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        expect(screen.getByText("부스에서 현금으로 결제해 주세요.")).toBeTruthy();
        expect(confirmButton().disabled).toBe(false);
        expect(confirmButton().textContent).toBe("8,000원 주문하기");
    });

    it("성공: 주문 완료 화면(/orders/{token}?new=1)으로 이동, 장바구니 비움", async () => {
        fillCart();
        fetchMock.mockResolvedValueOnce(json(201, order));
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());

        expect(await screen.findByText("주문이 접수됐어요. 주문 화면으로 이동하고 있어요.")).toBeTruthy();
        expect(router.replace).toHaveBeenCalledWith(`/orders/${order.statusToken}?new=1`);
        expect(useCart.getState().items).toEqual([]);
        expect(screen.queryByText("장바구니가 비어 있습니다")).toBeNull();
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body.paymentMethod).toBe("cash");
    });

    it("#89: 성공하면 이동하기 전에 주문 링크(토큰)·픽업 번호를 이 기기(localStorage)에 남긴다", async () => {
        fillCart();
        fetchMock.mockResolvedValueOnce(json(201, order));
        let storedWhenNavigating = null as string | null;
        router.replace.mockImplementation(() => {
            storedWhenNavigating = localStorage.getItem(MY_ORDERS_STORAGE_KEY);
        });
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());

        expect(await screen.findByText("주문이 접수됐어요. 주문 화면으로 이동하고 있어요.")).toBeTruthy();
        expect(router.replace).toHaveBeenCalledWith(`/orders/${order.statusToken}?new=1`);
        const saved = JSON.parse(storedWhenNavigating ?? "[]") as { statusToken: string; pickupNumber: number; savedAt: string }[];
        expect(saved.map(({ statusToken, pickupNumber }) => ({ statusToken, pickupNumber }))).toEqual([
            { statusToken: order.statusToken, pickupNumber: 5 },
        ]);
        expect(Number.isNaN(Date.parse(saved[0].savedAt))).toBe(false);
    });

    it("#89: 실패하면(재고 부족) 이 기기에 아무것도 남기지 않는다", async () => {
        fillCart();
        fetchMock.mockResolvedValueOnce(json(409, envelope("OUT_OF_STOCK", [{ menuItemId: CHEESE, requested: 2, available: 1 }])));
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());

        await screen.findByRole("alert");
        expect(localStorage.getItem(MY_ORDERS_STORAGE_KEY)).toBeNull();
    });

    it("계좌이체도 고를 수 있다: 계좌 안내 예고 문구가 보이고 paymentMethod 'transfer'로 주문한다 (T-31, 2026-10-05 결정)", async () => {
        fillCart();
        fetchMock.mockResolvedValueOnce(json(201, order));
        render(<CheckoutPage />);
        const transfer = screen.getByRole("radio", { name: "계좌이체" }) as HTMLInputElement;
        expect(transfer.disabled).toBe(false);
        fireEvent.click(transfer);
        expect(screen.getByText("주문하면 입금할 계좌를 안내해 드려요.")).toBeTruthy();
        fireEvent.click(confirmButton());

        expect(await screen.findByText("주문이 접수됐어요. 주문 화면으로 이동하고 있어요.")).toBeTruthy();
        expect(router.replace).toHaveBeenCalledWith(`/orders/${order.statusToken}?new=1`);
        const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
        expect(body.paymentMethod).toBe("transfer");
    });

    it("로딩: 주문 생성 중에는 버튼 잠금 + 진행 표시(중복 탭 방지)", async () => {
        fillCart();
        fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());
        const busy = await screen.findByRole("button", { name: "주문을 보내는 중…" });
        expect((busy as HTMLButtonElement).disabled).toBe(true);
        expect(busy.getAttribute("aria-busy")).toBe("true");
        fireEvent.click(busy);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect((screen.getByRole("radio", { name: "현금" }) as HTMLInputElement).disabled).toBe(true);
    });

    it("에러(재고 부족): 어떤 항목이 부족한지 표시 + 장바구니로 복귀 링크, 장바구니 유지", async () => {
        fillCart();
        fetchMock.mockResolvedValueOnce(json(409, envelope("OUT_OF_STOCK", [{ menuItemId: CHEESE, requested: 2, available: 1 }])));
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("재고가 부족한 메뉴가 있어요.");
        expect(alert.textContent).toContain("치즈 호떡: 남은 수량 1개");
        expect(within(alert).getByRole("link", { name: "장바구니로 돌아가기" }).getAttribute("href")).toBe("/cart");
        expect(within(alert).queryByRole("button", { name: "다시 시도" })).toBeNull();
        expect(useCart.getState().items).toHaveLength(2);
    });

    it("에러(F-47 429): '잠시 후 다시 시도해 주세요' + 수동 재시도(같은 멱등키) → 성공", async () => {
        fillCart();
        fetchMock
            .mockResolvedValueOnce(json(429, envelope("RATE_LIMITED", { retryAfterSeconds: 30 })))
            .mockResolvedValueOnce(json(200, { ...order, created: false }));
        render(<CheckoutPage />);
        fireEvent.click(screen.getByRole("radio", { name: "현금" }));
        fireEvent.click(confirmButton());

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("잠시 후 다시 시도해 주세요.");
        expect(useCart.getState().items).toHaveLength(2);
        fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));

        expect(await screen.findByText("주문이 접수됐어요. 주문 화면으로 이동하고 있어요.")).toBeTruthy();
        const keys = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).idempotencyKey);
        expect(keys[0]).toBe(keys[1]);
        expect(router.replace).toHaveBeenCalledTimes(1);
    });

    it("빈 장바구니로 들어오면 '장바구니가 비어 있습니다' + 메뉴판 링크, 확정 버튼 없음", async () => {
        render(<CheckoutPage />);
        expect(await screen.findByText("장바구니가 비어 있습니다")).toBeTruthy();
        expect(screen.getByRole("link", { name: "메뉴판으로 돌아가기" }).getAttribute("href")).toBe("/");
        expect(screen.queryByRole("button", { name: /주문하기|결제 방법을 선택해 주세요/ })).toBeNull();
    });
});
