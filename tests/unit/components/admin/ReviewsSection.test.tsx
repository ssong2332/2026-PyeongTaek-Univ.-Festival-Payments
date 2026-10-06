// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StatsPanel } from "@/components/admin/StatsPanel";
import type { AdminReviewsResponse } from "@/lib/dto/review";
import type { StatsDto } from "@/lib/dto/stats";

afterEach(cleanup);

const stats: StatsDto = {
    date: "all", sales: 0, orderCount: 0, refundedAmount: 0, refundedCount: 0, byMenu: [], hourlyByMenu: [],
    totals: { pending: 0, paid: 0, cooking: 0, completed: 0, cancelled: 0, refunded: 0, expired: 0 },
};
const reviews: AdminReviewsResponse = {
    date: "all", count: 3, averageRating: 4.3,
    reviews: [
        { orderId: "11111111-1111-4111-8111-000000000001", pickupNumber: 7, manualNumber: null,
            rating: 5, text: "겉바속촉 최고예요", createdAt: "2026-10-07T03:12:00.000Z" },
        { orderId: "11111111-1111-4111-8111-000000000002", pickupNumber: 2_100_000_001, manualNumber: 1,
            rating: 4, text: null, createdAt: "2026-10-07T02:05:00.000Z" },
        { orderId: "11111111-1111-4111-8111-000000000003", pickupNumber: 123, manualNumber: null,
            rating: 4, text: "", createdAt: "2026-10-06T15:00:00.000Z" },
    ],
};
const loadStats = async () => stats;

it("T-42 별점 평균과 후기 목록(픽업 번호·별점·텍스트·KST 시각)을 보여 준다", async () => {
    const loadReviews = vi.fn(async () => reviews);
    render(<StatsPanel loadStats={loadStats} loadReviews={loadReviews} initialDate="all" />);
    const section = await screen.findByRole("region", { name: "후기" });
    await waitFor(() => expect(within(section).getByText("4.3")).toBeTruthy());
    expect(loadReviews).toHaveBeenCalledWith("all");
    expect(within(section).getByText("3건")).toBeTruthy();
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("#007")).toBeTruthy();
    expect(within(items[0]).getByRole("img", { name: "별점 5점" })).toBeTruthy();
    expect(within(items[0]).getByText("겉바속촉 최고예요")).toBeTruthy();
    expect(within(items[0]).getByText("10. 7. 12:12").getAttribute("datetime")).toBe("2026-10-07T03:12:00.000Z");
    expect(within(items[1]).getByText("M-001")).toBeTruthy();
    expect(within(items[1]).getByRole("img", { name: "별점 4점" })).toBeTruthy();
    expect(within(items[1]).getByText("별점만 남김")).toBeTruthy();
    expect(within(items[2]).getByText("#123")).toBeTruthy();
    expect(within(items[2]).getByText("별점만 남김")).toBeTruthy();
    expect(within(items[2]).getByText("10. 7. 00:00")).toBeTruthy();
    // 후기는 작성 날짜, 매출 통계는 주문 날짜 기준이라는 것을 화면에 밝힌다.
    expect(within(section).getByText("후기 작성 날짜 기준 · 매출 통계는 주문 날짜 기준")).toBeTruthy();
});

it("T-42 후기 0건이면 '후기 없음'을 보여 주고 평균·목록은 그리지 않는다", async () => {
    render(<StatsPanel loadStats={loadStats} initialDate="all"
        loadReviews={async () => ({ date: "all", count: 0, averageRating: null, reviews: [] })} />);
    const section = await screen.findByRole("region", { name: "후기" });
    await waitFor(() => expect(within(section).getByText("후기 없음")).toBeTruthy());
    expect(within(section).queryByRole("list")).toBeNull();
    expect(within(section).queryByText("별점 평균")).toBeNull();
});

it("T-42 불러오는 중을 표시하고, 실패하면 안내 후 다시 시도할 수 있다", async () => {
    let fail!: (error: Error) => void;
    const loadReviews = vi.fn()
        .mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
        .mockResolvedValue(reviews);
    render(<StatsPanel loadStats={loadStats} loadReviews={loadReviews} initialDate="all" />);
    const section = await screen.findByRole("region", { name: "후기" });
    expect(within(section).getByRole("status").textContent).toContain("후기를 불러오는 중입니다");
    fail(new Error("offline"));
    await waitFor(() => expect(within(section).getByRole("alert").textContent).toContain("후기를 불러오지 못했습니다"));
    fireEvent.click(within(section).getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(within(section).getByText("4.3")).toBeTruthy());
    expect(loadReviews).toHaveBeenCalledTimes(2);
    expect(within(section).queryByRole("alert")).toBeNull();
});

it("T-42 매출 통계가 실패해도 후기는 따로 보여 주고, 날짜를 바꾸면 그 날짜로 다시 읽는다", async () => {
    const loadReviews = vi.fn(async () => reviews);
    render(<StatsPanel loadStats={async () => { throw new Error("stats down"); }} loadReviews={loadReviews} initialDate="all" />);
    await waitFor(() => expect(screen.getByText("통계를 불러오지 못했습니다. 새로고침해 주세요.")).toBeTruthy());
    const section = screen.getByRole("region", { name: "후기" });
    await waitFor(() => expect(within(section).getByText("4.3")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("조회 날짜"), { target: { value: "2026-10-08" } });
    await waitFor(() => expect(loadReviews).toHaveBeenCalledWith("2026-10-08"));
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(loadReviews).toHaveBeenCalledTimes(3));
});

it("T-42 이전 날짜 응답이 늦게 와도 새 날짜 화면을 덮어쓰지 않는다", async () => {
    let finishOld!: (value: AdminReviewsResponse) => void;
    const loadReviews = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
        .mockResolvedValue({ date: "2026-10-08", count: 0, averageRating: null, reviews: [] });
    render(<StatsPanel loadStats={loadStats} loadReviews={loadReviews} initialDate="all" />);
    fireEvent.change(screen.getByLabelText("조회 날짜"), { target: { value: "2026-10-08" } });
    const section = screen.getByRole("region", { name: "후기" });
    await waitFor(() => expect(within(section).getByText("후기 없음")).toBeTruthy());
    finishOld(reviews);
    await Promise.resolve();
    expect(within(section).getByText("후기 없음")).toBeTruthy();
    expect(within(section).queryByText("4.3")).toBeNull();
});

it("T-42 후기 불러오기가 없으면(목업 등) 후기 영역을 그리지 않는다", async () => {
    render(<StatsPanel loadStats={loadStats} initialDate="all" />);
    await waitFor(() => expect(screen.getAllByText("데이터 없음")).toHaveLength(2));
    expect(screen.queryByRole("region", { name: "후기" })).toBeNull();
});
