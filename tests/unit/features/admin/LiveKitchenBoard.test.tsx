// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const feedOrders = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("@/features/admin/useOrdersFeed", () => ({
    useOrdersFeed: () => ({ orders: feedOrders.current, isLoading: false, error: null, channelStatus: "SUBSCRIBED", reload, refresh }),
}));
vi.mock("@/features/admin/useConnectionMonitor", () => ({
    useConnectionMonitor: () => ({ isDisconnected: false, isChecking: false, checkNow: vi.fn(async () => true) }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

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
