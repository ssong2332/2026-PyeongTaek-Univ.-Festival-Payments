import { describe, expect, it, vi } from "vitest";
import type { ReportReviewRecord } from "@/domain/report/operationsReport";
import { aggregateStats, type StatsOrder } from "@/domain/stats/aggregate";
import { FESTIVAL_DATES } from "@/domain/stats/csv";
import { AppError } from "@/lib/api/errors";
import { OperationsReportSchema } from "@/lib/dto/report";
import { getOperationsReport } from "@/services/reportService";
import type { ReportRepository } from "@/services/reportPorts";

const MENU = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orders: StatsOrder[] = [
    { id: "o1", status: "completed", totalAmount: 7000, createdAt: "2026-10-07T01:00:00Z",
        items: [{ menuItemId: MENU, nameKo: "기본호떡", quantity: 2 }] },
    { id: "o2", status: "refunded", totalAmount: 3500, createdAt: "2026-10-08T01:00:00Z",
        items: [{ menuItemId: MENU, nameKo: "기본호떡", quantity: 1 }] },
];
const reviews: ReportReviewRecord[] = [{
    pickupNumber: 2_100_000_007, manualNumber: 7, orderedAt: "2026-10-07T01:00:00Z",
    rating: 5, text: "좋아요", createdAt: "2026-10-07T02:00:00.000Z",
}];

function repository(): ReportRepository {
    return {
        loadDailyStats: vi.fn(async (date: string) => aggregateStats(orders, date)),
        listReviews: vi.fn(async () => reviews),
    };
}

describe("getOperationsReport", () => {
    it("reads get_stats for each festival date and returns a contract-valid report", async () => {
        const repo = repository();
        const report = await getOperationsReport(FESTIVAL_DATES, repo);

        expect(vi.mocked(repo.loadDailyStats).mock.calls).toEqual([["2026-10-07"], ["2026-10-08"]]);
        expect(repo.listReviews).toHaveBeenCalledTimes(1);
        expect(OperationsReportSchema.safeParse(report).success).toBe(true);
        expect(report).toMatchObject({
            from: "2026-10-07", to: "2026-10-08", isEmpty: false,
            periodTotal: { sales: 7000, orderCount: 2, refundedCount: 1, refundedAmount: 3500 },
            reviews: { count: 1, averageRating: 5, items: [{ displayNumber: "M-007", text: "좋아요" }] },
        });
        expect(report.days.map(day => day.sales)).toEqual([7000, 0]);
    });

    it("reads only the requested single day", async () => {
        const repo = repository();
        const report = await getOperationsReport({ from: "2026-10-08", to: "2026-10-08" }, repo);
        expect(vi.mocked(repo.loadDailyStats).mock.calls).toEqual([["2026-10-08"]]);
        expect(report.periodTotal.sales).toBe(0);
        expect(report.reviews.count).toBe(0);
    });

    it.each([
        { from: "2026-10-08", to: "2026-10-07" },
        { from: "2026-02-30", to: "2026-03-01" },
        { from: "all", to: "all" },
        { from: "2026-10-01", to: "2026-11-01" },
    ])("rejects an invalid range $from ~ $to before reading the database", async range => {
        const repo = repository();
        await expect(getOperationsReport(range, repo)).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
        expect(repo.loadDailyStats).not.toHaveBeenCalled();
        expect(repo.listReviews).not.toHaveBeenCalled();
    });

    it("does not expose an aggregate that breaks the report contract", async () => {
        const repo = repository();
        vi.mocked(repo.loadDailyStats).mockImplementation(async date => ({ ...aggregateStats(orders, date), sales: -1 }));
        await expect(getOperationsReport(FESTIVAL_DATES, repo)).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });

    it("fails with an internal error when the database returns stats for another date", async () => {
        const repo = repository();
        vi.mocked(repo.loadDailyStats).mockImplementation(async () => aggregateStats(orders, "2026-10-07"));
        await expect(getOperationsReport(FESTIVAL_DATES, repo)).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });

    it("passes repository failures through unchanged", async () => {
        const repo = repository();
        const failure = new AppError("INTERNAL_ERROR", 500);
        vi.mocked(repo.listReviews).mockRejectedValueOnce(failure);
        await expect(getOperationsReport(FESTIVAL_DATES, repo)).rejects.toBe(failure);
    });
});
