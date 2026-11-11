// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "@/app/(customer)/page";
import CartPage from "@/app/(customer)/cart/page";
import { DocumentLang } from "@/components/customer/LanguageToggle";
import { useCart } from "@/features/customer/useCart";
import type { MenuItemDto, MenuResponse } from "@/lib/dto/menu";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n/locale";

// T-04 (F-05): 언어 en을 고르면 메뉴판 UI 문구·메뉴명·옵션명이 영어, 고른 언어는 이 기기에 남아 다른 화면에도 이어진다.
const NAMES = {
    ko: { menu: "치즈 호떡", group: "추가 옵션", option: "견과류 추가" },
    en: { menu: "Cheese Hotteok", group: "Extras", option: "Add nuts" },
};
const menuFor = (lang: "ko" | "en"): MenuItemDto => ({
    id: "22222222-2222-2222-2222-222222222222",
    name: NAMES[lang].menu,
    description: null,
    price: 2500,
    stock: 3,
    isRecommended: false,
    isAvailable: true,
    isSoldOut: false,
    imageUrl: null,
    optionGroups: [{
        id: "bbbbbbbb-0000-0000-0000-000000000001",
        name: NAMES[lang].group,
        minSelect: 0,
        maxSelect: 1,
        options: [{ id: "bbbbbbbb-0000-0000-0000-00000000000a", name: NAMES[lang].option, extraPrice: 0 }],
    }],
});

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
    fetchMock.mockReset();
    // 메뉴 API는 서버처럼 lang에 맞는 이름을 준다.
    fetchMock.mockImplementation(async (url) => {
        const lang = new URL(url, "http://localhost").searchParams.get("lang") === "en" ? "en" : "ko";
        return json(200, { items: [menuFor(lang)], waitingCount: 0, locale: lang } satisfies MenuResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    localStorage.clear();
    document.documentElement.lang = "ko";
    useCart.setState({ items: [] });
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const menuRequests = () => fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/menu"));

describe("언어 전환(F-05)", () => {
    it("처음에는 한국어(?lang=ko) — EN을 누르면 메뉴를 ?lang=en으로 다시 읽고 UI 문구·메뉴명이 영어", async () => {
        render(
            <>
                <DocumentLang />
                <MenuPage />
            </>,
        );
        expect(await screen.findByRole("heading", { name: "전체 메뉴" })).toBeTruthy();
        expect(screen.getAllByText("치즈 호떡").length).toBeGreaterThan(0);
        expect(menuRequests()).toEqual(["/api/menu?lang=ko"]);

        const en = screen.getByRole("button", { name: "EN" });
        expect(en.getAttribute("aria-pressed")).toBe("false");
        fireEvent.click(en);

        expect(await screen.findByRole("heading", { name: "All menu" })).toBeTruthy();
        await waitFor(() => expect(screen.getAllByText("Cheese Hotteok").length).toBeGreaterThan(0));
        expect(screen.queryByText("치즈 호떡")).toBeNull();
        expect(screen.getByPlaceholderText("Search by name")).toBeTruthy();
        expect(menuRequests()).toContain("/api/menu?lang=en");
        expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true");
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
        expect(document.documentElement.lang).toBe("en");

        // 옵션 이름·안내도 영어
        fireEvent.click(screen.getAllByText("Cheese Hotteok")[0]);
        expect(await screen.findByText("Add nuts")).toBeTruthy();
        expect(screen.getByText("Extras")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();

        // 한국어로 되돌리기
        fireEvent.click(screen.getByRole("button", { name: "한국어" }));
        expect(await screen.findByRole("heading", { name: "전체 메뉴" })).toBeTruthy();
        expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("ko");
    });

    it("이 기기에 고른 언어(en)는 장바구니 화면에도 이어지고, 한국어로 담은 항목 이름도 영어로 보인다", async () => {
        localStorage.setItem(LOCALE_STORAGE_KEY, "en");
        useCart.getState().addItem({
            menuItemId: "22222222-2222-2222-2222-222222222222",
            name: NAMES.ko.menu,
            unitPrice: 2500,
            quantity: 1,
            options: [{ id: "bbbbbbbb-0000-0000-0000-00000000000a", groupName: NAMES.ko.group, name: NAMES.ko.option, extraPrice: 0 }],
        });
        render(<CartPage />);
        expect(await screen.findByRole("heading", { name: "Cart" })).toBeTruthy();
        await waitFor(() => expect(screen.getByText("Cheese Hotteok")).toBeTruthy());
        expect(screen.getByText("Add nuts")).toBeTruthy();
        expect(screen.getByText("₩2,500", { selector: "output *" })).toBeTruthy();
        expect(menuRequests()).toEqual(["/api/menu?lang=en"]);
    });

    it("저장된 값이 지원하지 않는 언어면 한국어", async () => {
        localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
        render(<MenuPage />);
        expect(await screen.findByRole("heading", { name: "전체 메뉴" })).toBeTruthy();
        expect(menuRequests()).toEqual(["/api/menu?lang=ko"]);
    });
});
