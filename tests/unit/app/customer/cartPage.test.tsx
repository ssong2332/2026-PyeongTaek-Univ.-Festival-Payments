// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CartPage from "@/app/(customer)/cart/page";
import { useCart } from "@/features/customer/useCart";
import type { MenuItemDto } from "@/lib/dto/menu";

const CHEESE = "22222222-2222-2222-2222-222222222222";
const PLAIN = "11111111-1111-1111-1111-111111111111";
const NUTS = { id: "bbbbbbbb-0000-0000-0000-00000000000a", groupName: "추가 옵션", name: "견과류 추가", extraPrice: 500 };

function menu(id: string, overrides: Partial<MenuItemDto> = {}): MenuItemDto {
    return {
        id,
        name: id === CHEESE ? "치즈 호떡" : "기본호떡",
        description: null,
        price: id === CHEESE ? 2500 : 2000,
        stock: 10,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: null,
        optionGroups: id === CHEESE
            ? [{ id: "bbbbbbbb-0000-0000-0000-000000000001", name: "추가 옵션", minSelect: 0, maxSelect: 3, options: [{ id: NUTS.id, name: NUTS.name, extraPrice: 500 }] }]
            : [],
        ...overrides,
    };
}

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const serveMenu = (items: MenuItemDto[]) =>
    fetchMock.mockImplementation(async () => json(200, { items, waitingCount: 0, locale: "ko" }));

function fillCart() {
    useCart.getState().addItem({ menuItemId: CHEESE, name: "치즈 호떡", unitPrice: 2500, quantity: 2, options: [NUTS] });
    useCart.getState().addItem({ menuItemId: PLAIN, name: "기본호떡", unitPrice: 2000, quantity: 1, options: [] });
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    useCart.setState({ items: [] });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const orderButton = () => screen.getByRole("button", { name: /주문하기/ }) as HTMLButtonElement;

describe("장바구니(/cart) — PRD 화면 표 112행", () => {
    it("빈 값(F-04): '장바구니가 비어 있습니다' + 메뉴판 링크, 주문 버튼 비활성", async () => {
        serveMenu([]);
        render(<CartPage />);
        expect(await screen.findByText("장바구니가 비어 있습니다")).toBeTruthy();
        expect(screen.getByRole("link", { name: "메뉴판으로 돌아가기" }).getAttribute("href")).toBe("/");
        expect(orderButton().disabled).toBe(true);
    });

    it("항목·옵션·수량·합계를 보이고, 재검사를 통과하면 결제 화면 링크", async () => {
        fillCart();
        serveMenu([menu(CHEESE), menu(PLAIN)]);
        render(<CartPage />);
        const link = await screen.findByRole("link", { name: /주문하기/ });
        expect(link.getAttribute("href")).toBe("/checkout");
        expect(fetchMock.mock.calls[0][0]).toBe("/api/menu?lang=ko");
        const items = screen.getAllByRole("listitem");
        expect(items[0].textContent).toContain("견과류 추가");
        expect(items[0].textContent).toContain("6,000원");
        expect(screen.getByText("3개")).toBeTruthy();
        expect(screen.getByLabelText("합계").textContent).toBe("8,000원");
    });

    it("F-04: 하나를 삭제하면 합계가 남은 항목 기준으로 다시 계산된다", async () => {
        fillCart();
        serveMenu([menu(CHEESE), menu(PLAIN)]);
        render(<CartPage />);
        await screen.findByRole("link", { name: /주문하기/ });
        fireEvent.click(screen.getByRole("button", { name: "치즈 호떡 삭제" }));
        // 지운 줄은 옆으로 밀려나는 퇴장 모션 뒤에 사라진다.
        await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
        expect(screen.getByLabelText("합계").textContent).toBe("2,000원");
    });

    it("수량을 바꾸면 줄 금액·합계가 바뀐다", async () => {
        fillCart();
        serveMenu([menu(CHEESE), menu(PLAIN)]);
        render(<CartPage />);
        await screen.findByRole("link", { name: /주문하기/ });
        const plainItem = screen.getAllByRole("listitem")[1];
        fireEvent.click(within(plainItem).getByRole("button", { name: "수량 늘리기" }));
        expect(plainItem.textContent).toContain("4,000원");
        expect(screen.getByLabelText("합계").textContent).toBe("10,000원");
    });

    it("에러(품절): 담은 메뉴가 그 사이 품절되면 항목 경고 + 주문 진행 차단", async () => {
        fillCart();
        serveMenu([menu(CHEESE, { isSoldOut: true, isAvailable: false, stock: 0 }), menu(PLAIN)]);
        render(<CartPage />);
        expect(await screen.findByText("품절된 메뉴예요. 삭제해 주세요.")).toBeTruthy();
        expect(orderButton().disabled).toBe(true);
        expect(screen.getByText("주문할 수 없는 항목이 있어요. 표시된 항목을 고쳐 주세요.")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "치즈 호떡 삭제" }));
        expect(screen.getByRole("link", { name: /주문하기/ }).getAttribute("href")).toBe("/checkout");
    });

    it("재검사 중에는 주문 버튼 비활성", () => {
        fillCart();
        fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
        render(<CartPage />);
        expect(orderButton().disabled).toBe(true);
        expect(orderButton().textContent).toContain("확인 중");
    });

    it("재검사 요청이 실패하면 안내 + 다시 확인, 주문은 막지 않는다(서버가 최종 검증)", async () => {
        fillCart();
        fetchMock.mockImplementation(async () => json(503, { error: { code: "INTERNAL_ERROR", message: "x" } }));
        render(<CartPage />);
        expect(await screen.findByText("메뉴 정보를 확인하지 못했어요.")).toBeTruthy();
        expect(screen.getByRole("link", { name: /주문하기/ })).toBeTruthy();

        serveMenu([menu(CHEESE, { isSoldOut: true, isAvailable: false, stock: 0 }), menu(PLAIN)]);
        fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
        expect(await screen.findByText("품절된 메뉴예요. 삭제해 주세요.")).toBeTruthy();
    });
});
