// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makePreviewOrders } from "@/features/admin/DashboardPreview";
import { LiveOrderDashboard } from "@/features/admin/LiveOrderDashboard";

vi.mock("@/features/admin/useOrdersFeed", () => ({
    useOrdersFeed: () => ({ orders: makePreviewOrders(), isLoading: false, error: null, reload: vi.fn() }),
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
