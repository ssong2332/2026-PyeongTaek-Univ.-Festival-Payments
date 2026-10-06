import { describe, expect, it } from "vitest";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import {
    buildOperationsReport, listReportDates, REPORT_MAX_DAYS, type ReportReviewRecord,
} from "@/domain/report/operationsReport";
import { aggregateStats, type StatsOrder, type StatsSummary } from "@/domain/stats/aggregate";
import { buildOrdersCsv, FESTIVAL_DATES, type CsvOrder } from "@/domain/stats/csv";

// 같은 주문 데이터를 T-21(aggregateStats — get_stats와 같은 규칙)과 T-22(buildOrdersCsv) 입력 모양으로 바꿔 쓴다.
// orderedAt은 저장소가 넘기는 날짜 기준 시각이다(수기 주문은 manual_ordered_at, 그 밖은 created_at).
interface FixtureOrder {
    id: string;
    pickupNumber: number;
    manualNumber: number | null;
    orderedAt: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    items: { menuItemId: string; nameKo: string; quantity: number; lineTotal: number }[];
}

const MENU_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MENU_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const a = (quantity: number) => ({ menuItemId: MENU_A, nameKo: "기본호떡", quantity, lineTotal: 3500 * quantity });
const b = (quantity: number) => ({ menuItemId: MENU_B, nameKo: "뿌링클 호떡", quantity, lineTotal: 5000 * quantity });

function order(id: string, pickupNumber: number, status: OrderStatus, orderedAt: string,
    items: FixtureOrder["items"], manualNumber: number | null = null): FixtureOrder {
    return { id, pickupNumber, manualNumber, orderedAt, status, paymentMethod: "cash", items };
}

const fixture: FixtureOrder[] = [
    // KST 10-06 23:59:59 — 축제 전 리허설 주문(범위 밖)
    order("x-before", 90, "completed", "2026-10-06T14:59:59Z", [a(20)]),
    // KST 10-07
    order("c1", 1, "paid", "2026-10-06T15:00:00Z", [a(2)]),
    order("c2", 2, "completed", "2026-10-07T03:00:00Z", [b(1)]),
    order("c3", 3, "refunded", "2026-10-07T04:00:00Z", [a(1)]),
    order("c4", 4, "cancelled", "2026-10-07T05:00:00Z", [a(1)]),
    order("c5", 5, "expired", "2026-10-07T06:00:00Z", [a(1)]),
    order("m1", 2_100_000_001, "completed", "2026-10-07T14:59:59Z", [a(3)], 1),
    // KST 10-08
    order("c6", 6, "cooking", "2026-10-07T15:00:00Z", [b(2)]),
    order("c7", 7, "pending", "2026-10-08T02:00:00Z", [b(1)]),
    order("c8", 8, "completed", "2026-10-08T14:59:59.999Z", [a(1), b(1)]),
    // KST 10-09 00:00 — 축제 뒤(범위 밖)
    order("x-after", 91, "completed", "2026-10-08T15:00:00Z", [b(10)]),
];

const totalOf = (o: FixtureOrder) => o.items.reduce((sum, item) => sum + item.lineTotal, 0);
const toStatsOrder = (o: FixtureOrder): StatsOrder => ({
    id: o.id, status: o.status, totalAmount: totalOf(o), createdAt: o.orderedAt,
    items: o.items.map(item => ({ menuItemId: item.menuItemId, nameKo: item.nameKo, quantity: item.quantity })),
});
const toCsvOrder = (o: FixtureOrder): CsvOrder => ({
    id: o.id, pickupNumber: o.pickupNumber, manualNumber: o.manualNumber, createdAt: o.orderedAt,
    paymentMethod: o.paymentMethod, status: o.status, totalAmount: totalOf(o), reason: null,
    paidAt: null, completedAt: null,
    items: o.items.map(item => ({ menuNameKo: item.nameKo, options: [], quantity: item.quantity, lineTotal: item.lineTotal })),
});

const statsOrders = fixture.map(toStatsOrder);
const csvOrders = fixture.map(toCsvOrder);
const festivalDays = ["2026-10-07", "2026-10-08"];
// 저장소는 날짜마다 get_stats(date)를 부른다 — 단위 테스트에서는 같은 규칙의 aggregateStats로 대신한다.
const dailyStatsOf = (orders: readonly StatsOrder[], dates = festivalDays) => dates.map(date => aggregateStats(orders, date));

function review(pickupNumber: number, rating: number, createdAt: string, orderedAt: string,
    text: string | null = null, manualNumber: number | null = null): ReportReviewRecord {
    return { pickupNumber, manualNumber, orderedAt, rating, text, createdAt };
}

const reviews: ReportReviewRecord[] = [
    review(8, 4, "2026-10-08T15:10:00.000Z", "2026-10-08T14:59:59.999Z", ""),
    review(2_100_000_001, 4, "2026-10-08T01:00:00.000Z", "2026-10-07T14:59:59Z", null, 1),
    review(2, 5, "2026-10-07T03:30:00.000Z", "2026-10-07T03:00:00Z", "맛있어요"),
    // 범위 밖 주문의 후기 — 리포트에서 뺀다
    review(90, 1, "2026-10-07T00:10:00.000Z", "2026-10-06T14:59:59Z", "리허설"),
];

const zeroTotals = { pending: 0, paid: 0, cooking: 0, completed: 0, cancelled: 0, refunded: 0, expired: 0 };

describe("listReportDates", () => {
    it("lists every KST date from `from` to `to` inclusive, across a month boundary", () => {
        expect(listReportDates(FESTIVAL_DATES.from, FESTIVAL_DATES.to)).toEqual(["2026-10-07", "2026-10-08"]);
        expect(listReportDates("2026-10-07", "2026-10-07")).toEqual(["2026-10-07"]);
        expect(listReportDates("2026-10-31", "2026-11-01")).toEqual(["2026-10-31", "2026-11-01"]);
    });

    it(`accepts exactly ${REPORT_MAX_DAYS} days and rejects one more`, () => {
        expect(REPORT_MAX_DAYS).toBe(31);
        const dates = listReportDates("2026-10-01", "2026-10-31");
        expect(dates).toHaveLength(31);
        expect(dates.at(-1)).toBe("2026-10-31");
        expect(() => listReportDates("2026-10-01", "2026-11-01")).toThrow(RangeError);
    });

    it.each([
        ["2026-10-08", "2026-10-07"], ["2026-02-30", "2026-03-01"], ["2026-10-07", "2026-13-01"],
        ["all", "all"], ["", "2026-10-07"], ["2026-10-7", "2026-10-08"],
    ])("rejects an invalid or reversed range %s ~ %s", (from, to) => {
        expect(() => listReportDates(from, to)).toThrow(RangeError);
    });
});

describe("buildOperationsReport", () => {
    it("matches the F-41 example: 100,000 + 150,000 won, one refund, three reviews averaging 4.3", () => {
        const day = (date: string, sales: number, refundedCount: number): StatsSummary => ({
            date, sales, orderCount: 10 + refundedCount, refundedAmount: refundedCount * 5000, refundedCount,
            byMenu: [], totals: { ...zeroTotals, completed: 10, refunded: refundedCount },
        });
        const report = buildOperationsReport({
            from: "2026-10-07", to: "2026-10-08",
            dailyStats: [day("2026-10-07", 100_000, 1), day("2026-10-08", 150_000, 0)],
            reviews: [
                review(1, 4, "2026-10-07T01:00:00.000Z", "2026-10-07T00:30:00Z"),
                review(2, 4, "2026-10-07T02:00:00.000Z", "2026-10-07T01:30:00Z"),
                review(3, 5, "2026-10-08T02:00:00.000Z", "2026-10-08T01:30:00Z"),
            ],
        });
        expect(report.days.map(d => [d.date, d.sales])).toEqual([["2026-10-07", 100_000], ["2026-10-08", 150_000]]);
        expect(report.periodTotal.sales).toBe(250_000);
        expect(report.periodTotal.refundedCount).toBe(1);
        expect(report.reviews.count).toBe(3);
        expect(report.reviews.averageRating).toBe(4.3);
        expect(report.isEmpty).toBe(false);
    });

    it("keeps daily and period-total sales equal to the T-21 aggregate and the T-22 CSV for the same orders", () => {
        const report = buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats: dailyStatsOf(statsOrders), reviews,
        });

        for (const day of report.days) {
            const stats = aggregateStats(statsOrders, day.date);
            const csv = buildOrdersCsv(csvOrders, { from: day.date, to: day.date });
            expect(day.sales).toBe(stats.sales);
            expect(day.sales).toBe(csv.sales);
        }
        expect(report.periodTotal.sales).toBe(buildOrdersCsv(csvOrders, FESTIVAL_DATES).sales);
        expect(report.periodTotal.sales).toBe(report.days.reduce((sum, d) => sum + d.sales, 0));

        // 실제 값: 10-07 = 7,000 + 5,000 + 수기 10,500 / 10-08 = 10,000 + 8,500. 범위 밖 주문 2건은 빠진다.
        expect(report.days.map(d => d.sales)).toEqual([22_500, 18_500]);
        expect(report.periodTotal).toEqual({
            sales: 41_000,
            orderCount: 6,
            refundedAmount: 3500,
            cancelledCount: 1,
            refundedCount: 1,
            expiredCount: 1,
            totals: { pending: 1, paid: 1, cooking: 1, completed: 3, cancelled: 1, refunded: 1, expired: 1 },
            byMenu: [
                { menuItemId: MENU_A, nameKo: "기본호떡", quantity: 6, ratio: 0.6 },
                { menuItemId: MENU_B, nameKo: "뿌링클 호떡", quantity: 4, ratio: 0.4 },
            ],
        });
        expect(report.days[0]).toMatchObject({
            date: "2026-10-07", orderCount: 4, cancelledCount: 1, refundedCount: 1, expiredCount: 1,
            byMenu: [
                { menuItemId: MENU_A, quantity: 5 },
                { menuItemId: MENU_B, quantity: 1 },
            ],
        });
    });

    it("lists reviews of in-range orders oldest first, showing manual orders as M-001", () => {
        const report = buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats: dailyStatsOf(statsOrders), reviews,
        });
        expect(report.reviews).toEqual({
            count: 3,
            averageRating: 4.3,
            items: [
                { displayNumber: "2", rating: 5, text: "맛있어요", createdAt: "2026-10-07T03:30:00.000Z" },
                { displayNumber: "M-001", rating: 4, text: null, createdAt: "2026-10-08T01:00:00.000Z" },
                { displayNumber: "8", rating: 4, text: "", createdAt: "2026-10-08T15:10:00.000Z" },
            ],
        });
    });

    it("marks a period with zero orders as empty, with zero rows per day and no reviews", () => {
        const report = buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats: dailyStatsOf([]), reviews: [],
        });
        expect(report.isEmpty).toBe(true);
        expect(report.days).toHaveLength(2);
        expect(report.days.every(d => d.sales === 0 && d.byMenu.length === 0)).toBe(true);
        expect(report.periodTotal).toEqual({
            sales: 0, orderCount: 0, refundedAmount: 0, cancelledCount: 0, refundedCount: 0, expiredCount: 0,
            totals: zeroTotals, byMenu: [],
        });
        expect(report.periodTotal.sales).toBe(buildOrdersCsv([], FESTIVAL_DATES).sales);
        expect(report.reviews).toEqual({ count: 0, averageRating: null, items: [] });
    });

    it("treats orders without reviews as data, reporting zero reviews with no average", () => {
        const report = buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats: dailyStatsOf(statsOrders), reviews: [],
        });
        expect(report.isEmpty).toBe(false);
        expect(report.reviews).toEqual({ count: 0, averageRating: null, items: [] });
    });

    it("is not empty when only cancelled or expired orders exist, even with zero sales", () => {
        const onlyCancelled = [toStatsOrder(order("c", 1, "cancelled", "2026-10-07T01:00:00Z", [a(1)]))];
        const report = buildOperationsReport({
            from: "2026-10-07", to: "2026-10-07", dailyStats: dailyStatsOf(onlyCancelled, ["2026-10-07"]), reviews: [],
        });
        expect(report.isEmpty).toBe(false);
        expect(report.periodTotal).toMatchObject({ sales: 0, orderCount: 0, cancelledCount: 1, byMenu: [] });
    });

    it.each([
        [[4, 5], 4.5],
        [[1, 2, 2], 1.7],
        [[1, 1, 2], 1.3],
        [[5], 5],
    ])("rounds the average of %j to one decimal place (%d)", (ratings, expected) => {
        const report = buildOperationsReport({
            from: "2026-10-07", to: "2026-10-07", dailyStats: dailyStatsOf(statsOrders, ["2026-10-07"]),
            reviews: ratings.map((rating, i) => review(i + 1, rating, `2026-10-07T0${i}:00:00.000Z`, "2026-10-07T00:00:00Z")),
        });
        expect(report.reviews.averageRating).toBe(expected);
    });

    it("merges the same menu across days, keeping the smaller Korean name like get_stats min()", () => {
        const renamed = [
            toStatsOrder(order("d1", 1, "paid", "2026-10-07T01:00:00Z",
                [{ menuItemId: MENU_A, nameKo: "나 호떡", quantity: 1, lineTotal: 3500 }])),
            toStatsOrder(order("d2", 2, "paid", "2026-10-08T01:00:00Z",
                [{ menuItemId: MENU_A, nameKo: "가 호떡", quantity: 3, lineTotal: 10500 }])),
        ];
        const report = buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats: dailyStatsOf(renamed), reviews: [],
        });
        expect(report.periodTotal.byMenu).toEqual([{ menuItemId: MENU_A, nameKo: "가 호떡", quantity: 4, ratio: 1 }]);
    });

    it("rejects daily stats that do not cover every report date in order", () => {
        const [first, second] = dailyStatsOf(statsOrders);
        const build = (dailyStats: StatsSummary[]) => () => buildOperationsReport({
            from: FESTIVAL_DATES.from, to: FESTIVAL_DATES.to, dailyStats, reviews: [],
        });
        expect(build([first])).toThrow(RangeError);
        expect(build([second, first])).toThrow(RangeError);
        expect(build([first, second, second])).toThrow(RangeError);
    });

    it.each([0, 6, 4.5, Number.NaN])("rejects an out-of-range rating %d", rating => {
        expect(() => buildOperationsReport({
            from: "2026-10-07", to: "2026-10-07", dailyStats: dailyStatsOf(statsOrders, ["2026-10-07"]),
            reviews: [review(1, rating, "2026-10-07T01:00:00.000Z", "2026-10-07T00:00:00Z")],
        })).toThrow(RangeError);
    });

    it("rejects a review whose order time is not a timestamp", () => {
        expect(() => buildOperationsReport({
            from: "2026-10-07", to: "2026-10-07", dailyStats: dailyStatsOf(statsOrders, ["2026-10-07"]),
            reviews: [review(1, 3, "2026-10-07T01:00:00.000Z", "not-a-time")],
        })).toThrow(RangeError);
    });
});
