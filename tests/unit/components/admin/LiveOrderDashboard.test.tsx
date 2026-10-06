// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { makePreviewOrders } from "@/features/admin/DashboardPreview";
import { LiveOrderDashboard } from "@/features/admin/LiveOrderDashboard";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

const reloadOrders = vi.hoisted(() => vi.fn(async () => {}));
const refreshOrders = vi.hoisted(() => vi.fn(async () => {}));
// reload()/refresh()가 서버에서 다시 받아 올 주문 목록. null이면 목록을 바꾸지 않는다.
const server = vi.hoisted(() => ({ orders: null as AdminOrderDto[] | null }));
const monitorState = vi.hoisted(() => ({
    disconnected: false,
    checkNow: vi.fn(async () => true),
    options: null as null | {
        onRecover?: () => Promise<void> | void;
        onDisconnectedTick?: () => Promise<void> | void;
    },
}));
vi.mock("@/features/admin/useOrdersFeed", async () => {
    const { useState } = await import("react");
    return {
        useOrdersFeed: () => {
            const [orders, setOrders] = useState(makePreviewOrders);
            const applyServer = () => { if (server.orders) setOrders(server.orders); };
            return {
                orders, isLoading: false, error: null, channelStatus: "SUBSCRIBED",
                reload: async () => { await reloadOrders(); applyServer(); },
                refresh: async () => { await refreshOrders(); applyServer(); },
            };
        },
    };
});
vi.mock("@/features/admin/useConnectionMonitor", () => ({
    useConnectionMonitor: (options: typeof monitorState.options) => {
        monitorState.options = options;
        return { isDisconnected: monitorState.disconnected, isChecking: false, checkNow: monitorState.checkNow };
    },
}));
vi.mock("@/features/admin/useStaffCallsFeed", () => ({
    useStaffCallsFeed: () => ({
        calls: [], unacknowledgedCount: 0, isLoading: false, isAcknowledging: false,
        error: null, reload: vi.fn(async () => {}), acknowledge: vi.fn(async () => {}),
    }),
}));
afterEach(() => {
    cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); server.orders = null;
    monitorState.disconnected = false; monitorState.options = null;
});

it("reflects the validated acknowledge response even before a realtime update", async () => {
    const updated = { ...makePreviewOrders()[0], acknowledgedAt: "2026-09-25T11:00:00.000Z", updatedAt: "2026-09-25T11:00:00.000Z" };
    const request = vi.fn(async () => new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", request);
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "확인 처리" }));
    await waitFor(() => expect(screen.getByText("확인한 주문입니다.")).toBeTruthy());
    expect(request).toHaveBeenCalledWith(`/api/admin/orders/${updated.id}/acknowledge`, { method: "POST" });
});

it("does not report success for an unauthorized response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "확인 처리" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("확인 처리에 실패"));
    expect(screen.queryByText("확인한 주문입니다.")).toBeNull();
});

it("sends only the allowed transition action and applies the validated server response", async () => {
    const before = makePreviewOrders()[0];
    const updated = { ...before, status: "cooking", updatedAt: "2026-09-25T11:00:00.000Z",
        availableActions: ["complete", "refund"] };
    const request = vi.fn(async () => new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", request);
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "현금 수령 확인" }));
    await waitFor(() => expect(screen.getByText("픽업 #001 주문 상태를 변경했습니다.")).toBeTruthy());
    expect(request).toHaveBeenCalledWith(`/api/admin/orders/${before.id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_cash" }),
    });
    expect((screen.getByRole("button", { name: "조리 완료" }) as HTMLButtonElement).disabled).toBe(false);
});

it.each([
    ["INVALID_TRANSITION", "현재 주문 상태에서는 이 작업을 할 수 없습니다"],
    ["STATE_CHANGED", "다른 요청으로 주문 상태가 변경됐습니다"],
])("shows the %s conflict separately and reloads the order", async (code, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code } }), { status: 409 })));
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "현금 수령 확인" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "주문 상태 변경" })).getByRole("alert").textContent).toContain(message));
    expect(reloadOrders).toHaveBeenCalledTimes(1);
});

it.each([
    ["REASON_REQUIRED", "취소·환불 사유가 필요합니다"],
    ["REFUND_CHANNEL_REQUIRED", "환불 경로 정보가 누락됐습니다"],
])("shows the %s validation error and keeps the refund reason", async (code, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code } }), { status: 400 })));
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 003 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "환불 처리" }));
    fireEvent.change(screen.getByLabelText("환불 사유 (필수, 최대 200자)"), { target: { value: "고객 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "환불 기록" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(message));
    expect((screen.getByLabelText("환불 사유 (필수, 최대 200자)") as HTMLTextAreaElement).value).toBe("고객 요청");
    expect(reloadOrders).not.toHaveBeenCalled();
});

it("sends refund reason and payment-specific channel to the transition endpoint", async () => {
    const before = makePreviewOrders()[2];
    const updated = { ...before, status: "refunded", lastReason: "고객 요청", refundChannel: "cash",
        updatedAt: "2026-09-25T11:00:00.000Z", availableActions: [] };
    const request = vi.fn(async () => new Response(JSON.stringify(updated), { status: 200 }));
    vi.stubGlobal("fetch", request);
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 003 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "환불 처리" }));
    fireEvent.change(screen.getByLabelText("환불 사유 (필수, 최대 200자)"), { target: { value: " 고객 요청 " } });
    fireEvent.click(screen.getByRole("button", { name: "환불 기록" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/orders/${before.id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refund", reason: "고객 요청", refundChannel: "cash" }),
    }));
    await waitFor(() => expect(screen.getByText("처리 사유: 고객 요청")).toBeTruthy());
});

it("returns the card to the latest server state after a 409 and keeps the failure next to the buttons", async () => {
    server.orders = makePreviewOrders().map(order => order.pickupNumber === 1 ? {
        ...order, status: "cooking", updatedAt: "2026-09-25T11:00:00.000Z",
        paidAt: "2026-09-25T11:00:00.000Z", cookingStartedAt: "2026-09-25T11:00:00.000Z",
        availableActions: ["complete", "refund"],
    } : order);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        error: { code: "STATE_CHANGED", message: "Order state has changed." },
    }), { status: 409 })));
    render(<LiveOrderDashboard />);
    fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
    fireEvent.click(screen.getByRole("button", { name: "현금 수령 확인" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "주문 상태 변경" }))
        .getByRole("alert").textContent).toContain("다른 요청으로 주문 상태가 변경됐습니다"));
    const actions = screen.getByRole("group", { name: "주문 상태 변경" });
    expect((within(actions).getByRole("button", { name: "조리 완료" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(actions).getByRole("button", { name: "현금 수령 확인" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByRole("region", { name: "주문 상세" })).getByText("조리중")).toBeTruthy();
    expect(reloadOrders).toHaveBeenCalledTimes(1);
});

it.each([
    [200, "4.0"],
    [401, "후기를 불러오지 못했습니다"],
])("T-42 매출 통계 탭은 후기를 관리자 API로 따로 불러온다(응답 %i)", async (status, shown) => {
    const stats = { date: "all", sales: 0, orderCount: 0, refundedAmount: 0, refundedCount: 0, byMenu: [], hourlyByMenu: [],
        totals: { pending: 0, paid: 0, cooking: 0, completed: 0, cancelled: 0, refunded: 0, expired: 0 } };
    const reviews = { date: "all", count: 1, averageRating: 4, reviews: [{
        orderId: "11111111-1111-4111-8111-000000000001", pickupNumber: 7, manualNumber: null,
        rating: 4, text: "맛있어요", createdAt: "2026-10-07T03:12:00.000Z" }] };
    const request = vi.fn(async (url: string) => url.startsWith("/api/admin/reviews")
        ? new Response(status === 200 ? JSON.stringify(reviews) : null, { status })
        : new Response(JSON.stringify(stats), { status: 200 }));
    vi.stubGlobal("fetch", request);
    render(<LiveOrderDashboard />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "관리자 메뉴" })).getByRole("button", { name: "매출 통계" }));
    const section = await screen.findByRole("region", { name: "후기" });
    await waitFor(() => expect(section.textContent).toContain(shown));
    expect(request).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/admin\/reviews\?date=\d{4}-\d{2}-\d{2}$/), { cache: "no-store" });
});

it("T-23 배너 재확인은 헬스체크를 호출하고 끊김 폴링·복구는 refresh로 재동기화한다", async () => {
    monitorState.disconnected = true;
    render(<LiveOrderDashboard />);
    expect(screen.getByRole("button", { name: "픽업 001 주문 상세" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("서버 연결이 끊겼습니다");

    await monitorState.options?.onDisconnectedTick?.();
    expect(refreshOrders).toHaveBeenCalledTimes(1);
    expect(reloadOrders).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(() => expect(monitorState.checkNow).toHaveBeenCalledTimes(1));
    await monitorState.options?.onRecover?.();
    expect(refreshOrders).toHaveBeenCalledTimes(2);
});
