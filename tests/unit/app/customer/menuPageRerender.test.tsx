// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "@/app/(customer)/page";
import { QUEUE_REFRESH_MS } from "@/features/customer/useMenu";
import { useCart } from "@/features/customer/useCart";

// 대기 수 갱신은 30초마다 온다 — 그때 메뉴 카드까지 다시 그리면 휴대폰에서 모션이 끊긴다.
const cardRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/components/customer/MenuCard", () => ({
    MenuCard: ({ name }: { name: string }) => {
        cardRenders.count += 1;
        return <p>{name}</p>;
    },
}));

const item = {
    id: "11111111-1111-1111-1111-111111111111", name: "기본 호떡", description: null, price: 2000, stock: 5,
    isRecommended: false, isAvailable: true, isSoldOut: false, imageUrl: null, optionGroups: [],
};
const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
let waitingCount = 3;

beforeEach(() => {
    vi.useFakeTimers();
    waitingCount = 3;
    cardRenders.count = 0;
    sessionStorage.clear();
    localStorage.clear();
    useCart.setState({ items: [] });
    vi.stubGlobal("fetch", async (url: string) => (String(url).startsWith("/api/queue") ? json({ waitingCount }) : json({ items: [item], waitingCount, locale: "ko" })));
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("메뉴판 — 대기 수 갱신", () => {
    it("대기 수가 바뀌어도 메뉴 카드는 다시 그리지 않고 대기 수만 바뀐다", async () => {
        render(<MenuPage />);
        await act(async () => { await vi.advanceTimersByTimeAsync(0); });
        expect(screen.getByText("3건이 처리 중입니다")).toBeTruthy();
        const before = cardRenders.count;
        expect(before).toBeGreaterThan(0);

        waitingCount = 5;
        await act(async () => { await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS); });

        expect(screen.getByText("5건이 처리 중입니다")).toBeTruthy();
        expect(cardRenders.count).toBe(before);
    });
});
