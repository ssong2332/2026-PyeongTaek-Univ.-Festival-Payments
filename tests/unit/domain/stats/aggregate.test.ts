import { describe, expect, it } from "vitest";
import { aggregateStats, kstDayUtcRange, type StatsOrder } from "@/domain/stats/aggregate";

const order = (id: string, status: StatsOrder["status"], totalAmount: number,
    createdAt: string, items: StatsOrder["items"] = []): StatsOrder => ({
    id, status, totalAmount, createdAt, items,
});

const menuA = { menuItemId: "menu-a", nameKo: "기본호떡", quantity: 1 };
const menuB = { menuItemId: "menu-b", nameKo: "뿌링클", quantity: 3 };

describe("aggregateStats", () => {
    it("separates refunded orders from sales and counts all seven statuses", () => {
        const result = aggregateStats([
            order("pending", "pending", 7000, "2026-10-07T01:00:00Z", [menuA]),
            order("paid", "paid", 10000, "2026-10-07T02:00:00Z", [menuA, menuB]),
            order("cooking", "cooking", 10000, "2026-10-07T03:00:00Z", [menuA]),
            order("completed", "completed", 10000, "2026-10-07T04:00:00Z", [menuB]),
            order("refunded", "refunded", 5000, "2026-10-07T05:00:00Z", [menuB]),
            order("cancelled", "cancelled", 4000, "2026-10-07T06:00:00Z", [menuA]),
            order("expired", "expired", 3000, "2026-10-07T07:00:00Z", [menuA]),
        ], "2026-10-07");
        expect(result.sales).toBe(30000);
        expect(result.orderCount).toBe(4);
        expect(result.refundedAmount).toBe(5000);
        expect(result.refundedCount).toBe(1);
        expect(result.totals).toEqual({ pending: 1, paid: 1, cooking: 1, completed: 1,
            cancelled: 1, refunded: 1, expired: 1 });
        expect(result.byMenu).toEqual([
            { menuItemId: "menu-b", nameKo: "뿌링클", quantity: 6, ratio: 0.75 },
            { menuItemId: "menu-a", nameKo: "기본호떡", quantity: 2, ratio: 0.25 },
        ]);
    });

    it("produces the exact UTC bounds of a KST day", () => {
        expect(kstDayUtcRange("2026-10-07")).toEqual({
            start: "2026-10-06T15:00:00.000Z", end: "2026-10-07T15:00:00.000Z",
        });
        expect(() => kstDayUtcRange("2026-02-30")).toThrow(RangeError);
        expect(kstDayUtcRange("0099-01-01").start).toBe("0098-12-31T15:00:00.000Z");
    });

    it("matches the 30,000 won payment and 5,000 won refund example", () => {
        const result = aggregateStats([
            order("a", "paid", 10000, "2026-10-07T01:00:00Z"),
            order("b", "completed", 15000, "2026-10-07T02:00:00Z"),
            order("c", "refunded", 5000, "2026-10-07T03:00:00Z"),
        ], "2026-10-07");
        expect(result).toMatchObject({ sales: 25000, orderCount: 3, refundedAmount: 5000 });
    });

    it("uses KST calendar days and returns an empty menu series for zero sales", () => {
        const rows = [
            order("today", "paid", 2000, "2026-10-06T15:00:00Z", [menuA]),
            order("yesterday", "paid", 9000, "2026-10-06T14:59:59Z", [menuB]),
            order("tomorrow", "paid", 6000, "2026-10-07T15:00:00Z", [menuB]),
        ];
        expect(aggregateStats(rows, "2026-10-07").sales).toBe(2000);
        expect(aggregateStats(rows, "all").sales).toBe(17000);
        expect(aggregateStats([order("p", "pending", 1000, "2026-10-07T02:00:00Z")], "2026-10-07").byMenu).toEqual([]);
    });
});
