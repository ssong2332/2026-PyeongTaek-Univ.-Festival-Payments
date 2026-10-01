// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "@/app/(customer)/page";
import { useCart } from "@/features/customer/useCart";
import type { MenuItemDto, MenuResponse } from "@/lib/dto/menu";

// 화면 "준비됨(ready)" 상태 검증: DB 없이 GET /api/menu 응답을 가짜로 준다(Architecture 테스트 전략 — 단위).
const plain: MenuItemDto = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "기본호떡",
    description: "기본호떡",
    price: 2000,
    stock: 5,
    isAvailable: true,
    isSoldOut: false,
    imageUrl: null,
    optionGroups: [],
};
const cheese: MenuItemDto = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "치즈 호떡",
    description: "녹진한 모짜렐라 치즈",
    price: 2500,
    stock: 3,
    isAvailable: true,
    isSoldOut: false,
    imageUrl: null,
    optionGroups: [{
        id: "bbbbbbbb-0000-0000-0000-000000000001",
        name: "추가 옵션",
        minSelect: 0,
        maxSelect: 3,
        options: [{ id: "bbbbbbbb-0000-0000-0000-00000000000a", name: "견과류 추가", extraPrice: 500 }],
    }],
};
const seed: MenuItemDto = {
    id: "33333333-3333-3333-3333-333333333333",
    name: "씨앗 호떡",
    description: "견과류가 들어간 호떡",
    price: 2000,
    stock: 0,
    isAvailable: false,
    isSoldOut: true,
    imageUrl: null,
    optionGroups: [],
};

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
function serveMenu(items: MenuItemDto[], waitingCount = 3) {
    fetchMock.mockImplementation(async () => json(200, { items, waitingCount, locale: "ko" } satisfies MenuResponse));
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

const menuButton = (name: string) => screen.getByRole("button", { name: new RegExp(name) }) as HTMLButtonElement;

describe("메뉴판(/) — PRD 화면 표 111행", () => {
    it("로딩: 스켈레톤 → 준비됨: 메뉴 목록·가격·대기 건수, 장바구니 비었으면 하단 바 비활성", async () => {
        serveMenu([plain, cheese, seed]);
        render(<MenuPage />);
        expect(screen.getByRole("status").textContent).toContain("메뉴를 불러오는 중");

        expect(await screen.findByRole("button", { name: /치즈 호떡/ })).toBeTruthy();
        expect(menuButton("기본호떡").textContent).toContain("2,000원");
        expect(screen.getByText("3건이 처리 중입니다")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "호떡 부스" })).toBeTruthy();
        const bar = screen.getByRole("button", { name: "메뉴를 선택해 담아보세요" }) as HTMLButtonElement;
        expect(bar.disabled).toBe(true);
    });

    it("F-01 품절: 품절 메뉴는 '품절' 라벨과 함께 선택 불가", async () => {
        serveMenu([plain, seed]);
        render(<MenuPage />);
        await screen.findByRole("button", { name: /씨앗 호떡/ });
        expect(menuButton("씨앗 호떡").disabled).toBe(true);
        expect(menuButton("씨앗 호떡").textContent).toContain("품절");
        fireEvent.click(menuButton("씨앗 호떡"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("F-03·F-04: 메뉴를 눌러 옵션·수량을 고르고 담으면 하단 바에 개수·합계", async () => {
        serveMenu([plain, cheese]);
        render(<MenuPage />);
        fireEvent.click(await screen.findByRole("button", { name: /치즈 호떡/ }));

        const dialog = screen.getByRole("dialog", { name: "치즈 호떡" });
        fireEvent.click(within(dialog).getByRole("checkbox", { name: /견과류 추가/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "수량 늘리기" }));
        const add = within(dialog).getByRole("button", { name: /담기/ });
        expect(add.textContent).toContain("6,000원");
        fireEvent.click(add);

        expect(screen.queryByRole("dialog")).toBeNull();
        const cartLink = screen.getByRole("link", { name: /장바구니 보기/ });
        expect(cartLink.getAttribute("href")).toBe("/cart");
        expect(cartLink.getAttribute("aria-label")).toBe("장바구니 보기 (2개, 6,000원)");
        expect(screen.getByRole("link", { name: "장바구니 2개" })).toBeTruthy();
        expect(useCart.getState().items).toHaveLength(1);
    });

    it("F-02: 상세의 수량 상한은 재고(3) — 3에서 늘리기 비활성", async () => {
        serveMenu([cheese]);
        render(<MenuPage />);
        fireEvent.click(await screen.findByRole("button", { name: /치즈 호떡/ }));
        const plus = screen.getByRole("button", { name: "수량 늘리기" }) as HTMLButtonElement;
        fireEvent.click(plus);
        fireEvent.click(plus);
        expect(screen.getByRole("group", { name: "수량" }).textContent).toContain("3");
        expect(plus.disabled).toBe(true);
    });

    it("검색: 이름 일부로 거르고, 0건이면 '검색 결과가 없습니다', 지우면 전체 (대기 카드는 유지)", async () => {
        serveMenu([plain, cheese, seed]);
        render(<MenuPage />);
        await screen.findByRole("button", { name: /치즈 호떡/ });
        const search = screen.getByLabelText("메뉴 검색");

        fireEvent.change(search, { target: { value: "치즈" } });
        expect(screen.queryByRole("button", { name: /기본호떡/ })).toBeNull();
        expect(screen.getByRole("button", { name: /치즈 호떡/ })).toBeTruthy();

        fireEvent.change(search, { target: { value: "떡볶이" } });
        expect(screen.getByText("검색 결과가 없습니다")).toBeTruthy();
        expect(screen.queryByText("현재 주문 가능한 메뉴가 없습니다")).toBeNull();
        expect(screen.getByText("3건이 처리 중입니다")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
        expect(screen.getAllByRole("button", { name: /호떡/ })).toHaveLength(3);
    });

    it("빈 값: 메뉴 0개면 '현재 주문 가능한 메뉴가 없습니다'", async () => {
        serveMenu([], 0);
        render(<MenuPage />);
        expect(await screen.findByText("현재 주문 가능한 메뉴가 없습니다")).toBeTruthy();
        expect(screen.queryByText("검색 결과가 없습니다")).toBeNull();
        expect(screen.getByText("대기 없음")).toBeTruthy();
    });

    it("빈 값: 전부 품절이어도 안내하고, 품절 메뉴는 목록에 보인다", async () => {
        serveMenu([seed]);
        render(<MenuPage />);
        expect(await screen.findByText("현재 주문 가능한 메뉴가 없습니다")).toBeTruthy();
        expect(menuButton("씨앗 호떡").disabled).toBe(true);
    });

    it("에러: 안내 + 다시 시도 → 성공하면 목록", async () => {
        fetchMock.mockResolvedValueOnce(json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }));
        render(<MenuPage />);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("메뉴를 불러오지 못했어요.");

        serveMenu([plain]);
        fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
        expect(await screen.findByRole("button", { name: /기본호떡/ })).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });
});
