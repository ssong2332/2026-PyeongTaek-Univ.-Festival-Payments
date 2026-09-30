// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makePreviewOrders } from "@/features/admin/DashboardPreview";
import { LiveOrderDashboard } from "@/features/admin/LiveOrderDashboard";

const reloadOrders = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/features/admin/useOrdersFeed", () => ({
    useOrdersFeed: () => ({ orders: makePreviewOrders(), isLoading: false, error: null, reload: reloadOrders }),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

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
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(message));
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
