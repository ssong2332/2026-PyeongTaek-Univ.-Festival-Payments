// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StatsPanel } from "@/components/admin/StatsPanel";
import type { StatsDto } from "@/lib/dto/stats";

afterEach(cleanup);

const summary: StatsDto = {
    date: "all", sales: 25000, orderCount: 3, refundedAmount: 5000, refundedCount: 1,
    byMenu: [
        { menuItemId: "00000000-0000-4000-8000-000000000001", nameKo: "기본호떡", quantity: 10, ratio: 0.25 },
        { menuItemId: "00000000-0000-4000-8000-000000000002", nameKo: "치즈호떡", quantity: 30, ratio: 0.75 },
    ],
    totals: { pending: 1, paid: 1, cooking: 1, completed: 1, cancelled: 1, refunded: 1, expired: 1 },
};

it("shows the aggregate and accessible menu quantities and ratios", async () => {
    const loadStats = vi.fn(async () => summary);
    render(<StatsPanel loadStats={loadStats} initialDate="all" />);
    await waitFor(() => expect(screen.getByText("25,000원")).toBeTruthy());
    expect(loadStats).toHaveBeenCalledWith("all");
    expect(screen.getByText("5,000원")).toBeTruthy();
    expect(screen.getByText("10개")).toBeTruthy();
    expect(screen.getByText("25.0%")).toBeTruthy();
    expect(screen.getByText("75.0%")).toBeTruthy();
    expect(screen.getByRole("link", { name: "CSV 다운로드" }).getAttribute("href"))
        .toBe("/api/admin/stats/csv?from=all&to=all");
});

it("shows an empty chart state when no menus sold", async () => {
    render(<StatsPanel loadStats={async () => ({ ...summary, byMenu: [] })} initialDate="all" />);
    await waitFor(() => expect(screen.getByText("데이터 없음")).toBeTruthy());
    expect(screen.queryByText("메뉴별 판매 수량과 비율")).toBeNull();
});

it("loads the selected day and offers retry after an error", async () => {
    const loadStats = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(summary);
    render(<StatsPanel loadStats={loadStats} initialDate="all" />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("통계를 불러오지 못했습니다"));
    fireEvent.change(screen.getByLabelText("조회 날짜"), { target: { value: "2026-10-07" } });
    await waitFor(() => expect(loadStats).toHaveBeenCalledWith("2026-10-07"));
    expect(screen.getByRole("link", { name: "CSV 다운로드" }).getAttribute("href"))
        .toBe("/api/admin/stats/csv?from=2026-10-07&to=2026-10-07");
    await waitFor(() => expect(screen.getByText("25,000원")).toBeTruthy());
});
