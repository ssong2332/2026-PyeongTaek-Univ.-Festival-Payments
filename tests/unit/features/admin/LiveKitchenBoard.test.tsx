// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LiveKitchenBoard } from "@/features/admin/LiveKitchenBoard";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

const NOW = "2026-10-07T05:30:00.000Z";
const ID = "00000000-0000-4000-8000-000000000007";
const cooking: AdminOrderDto = {
    id: ID, pickupNumber: 7, status: "cooking", paymentMethod: "cash", totalAmount: 2000,
    items: [{ menuNameKo: "기본 호떡", quantity: 1, options: [], lineTotal: 2000 }],
    createdAt: NOW, updatedAt: NOW, acknowledgedAt: NOW, transferReportedAt: null,
    cancelRequestedAt: null, cancelRejectedAt: null, paidAt: NOW, cookingStartedAt: NOW,
    completedAt: null, closedAt: null, refundChannel: null, lastReason: null, availableActions: ["complete", "refund"],
};
const reload = vi.hoisted(() => vi.fn(async () => {}));
const refresh = vi.hoisted(() => vi.fn(async () => {}));
const feedOrders = vi.hoisted(() => ({ current: [] as unknown[], options: null as unknown, total: null as number | null }));

vi.mock("@/features/admin/useOrdersFeed", async (importOriginal) => ({
    // 최신 판정(pickNewerOrder)은 실제 구현을 쓰고, 피드만 바꿔 끼운다.
    ...(await importOriginal<typeof import("@/features/admin/useOrdersFeed")>()),
    useOrdersFeed: (options: unknown) => {
        feedOrders.options = options;
        return { orders: feedOrders.current, total: feedOrders.total, isLoading: false, error: null, channelStatus: "SUBSCRIBED", reload, refresh };
    },
}));
vi.mock("@/features/admin/useConnectionMonitor", () => ({
    useConnectionMonitor: () => ({ isDisconnected: false, isChecking: false, checkNow: vi.fn(async () => true) }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); feedOrders.total = null; });

it("posts the complete action and removes the order as soon as the server confirms", async () => {
    feedOrders.current = [cooking];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        ...cooking, status: "completed", updatedAt: "2026-10-07T05:31:00.000Z", completedAt: "2026-10-07T05:31:00.000Z", availableActions: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LiveKitchenBoard initialNow={NOW} />);

    fireEvent.click(screen.getByRole("button", { name: "#007 조리 완료" }));

    await screen.findByText("조리중인 주문이 없습니다.");
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/orders/${ID}/transition`, expect.objectContaining({
        method: "POST", body: JSON.stringify({ action: "complete" }),
    }));
});

it("reloads the feed and shows why when the order already changed", async () => {
    feedOrders.current = [cooking];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "INVALID_TRANSITION" } }), { status: 409 })));
    render(<LiveKitchenBoard initialNow={NOW} />);

    fireEvent.click(screen.getByRole("button", { name: "#007 조리 완료" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("현재 주문 상태에서는");
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

function completedResponse(updatedAt: string) {
    return vi.fn(async () => new Response(JSON.stringify({
        ...cooking, status: "completed", updatedAt, completedAt: updatedAt, availableActions: [],
    }), { status: 200 }));
}

it("asks the feed for every cooking order regardless of date", () => {
    feedOrders.current = [];
    render(<LiveKitchenBoard initialNow={NOW} />);
    expect(feedOrders.options).toEqual({ scope: "kitchen", limit: 200 });
});

it("says how many cooking orders are not loaded yet and loads 200 more on request, up to 1000", () => {
    feedOrders.current = [cooking];
    feedOrders.total = 1201;
    render(<LiveKitchenBoard initialNow={NOW} />);
    expect(screen.getByRole("status").textContent).toContain("1001건은 아직 안 보여요");

    for (const limit of [400, 600, 800, 1000]) {
        fireEvent.click(screen.getByRole("button", { name: "더 불러오기" }));
        expect(feedOrders.options).toEqual({ scope: "kitchen", limit });
    }
    expect(screen.getByRole("status").textContent).toContain("201건은 아직 안 보여요");
    expect(screen.getByRole("status").textContent).toContain("앞 주문을 완료하면 이어서 보여요");
    expect(screen.queryByRole("button", { name: "더 불러오기" })).toBeNull();
});

it("shows no load-more notice when everything is loaded", () => {
    feedOrders.current = [cooking];
    feedOrders.total = 1;
    render(<LiveKitchenBoard initialNow={NOW} />);
    expect(screen.queryByRole("status")).toBeNull();
});

it("compares timestamps as instants: a newer server response wins even when its text sorts lower", async () => {
    // 피드 값 14:30+09:00(=05:30Z)보다 응답 05:31Z가 최신이다. 문자열 비교면 "05" < "14"라 응답을 버린다.
    feedOrders.current = [{ ...cooking, updatedAt: "2026-10-07T14:30:00+09:00" }];
    vi.stubGlobal("fetch", completedResponse("2026-10-07T05:31:00Z"));
    render(<LiveKitchenBoard initialNow={NOW} />);

    fireEvent.click(screen.getByRole("button", { name: "#007 조리 완료" }));

    await screen.findByText("조리중인 주문이 없습니다.");
});

it("keeps a newer realtime state over an older completion response", async () => {
    feedOrders.current = [cooking];
    // 응답 14:31+09:00(=05:31Z). 문자열 비교면 "14" > "05"라 뒤에 온 더 최신 피드(05:32Z)를 덮어쓴다.
    vi.stubGlobal("fetch", completedResponse("2026-10-07T14:31:00+09:00"));
    const { rerender } = render(<LiveKitchenBoard initialNow={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: "#007 조리 완료" }));
    await screen.findByText("조리중인 주문이 없습니다.");

    feedOrders.current = [{ ...cooking, updatedAt: "2026-10-07T05:32:00Z" }];
    rerender(<LiveKitchenBoard initialNow={NOW} />);

    expect(within(screen.getByRole("list", { name: "조리중 주문" })).getByText("#007")).toBeTruthy();
});
