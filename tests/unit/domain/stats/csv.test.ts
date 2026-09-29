import { describe, expect, it } from "vitest";
import { aggregateStats } from "@/domain/stats/aggregate";
import { buildOrdersCsv, CSV_HEADERS, type CsvOrder } from "@/domain/stats/csv";

const base: CsvOrder = {
    id: "order-1", pickupNumber: 1, createdAt: "2026-10-06T15:00:00Z",
    paymentMethod: "cash", status: "paid", totalAmount: 5000, reason: null,
    paidAt: "2026-10-06T15:01:00Z", completedAt: null,
    items: [
        { menuNameKo: "기본호떡", options: ["견과류"], quantity: 1, lineTotal: 2000 },
        { menuNameKo: "뿌링클", options: ["치즈", "꿀"], quantity: 1, lineTotal: 3000 },
    ],
};

describe("T-22 order CSV", () => {
    it("returns the agreed BOM and 13 headers even when there are no orders", () => {
        const result = buildOrdersCsv([]);
        expect(CSV_HEADERS).toHaveLength(13);
        expect(result).toEqual({ content: `\uFEFF${CSV_HEADERS.join(",")}\r\n`, sales: 0, rowCount: 0 });
    });

    it("uses one row per item and matches the T-21 sales rule across payment states", () => {
        const orders: CsvOrder[] = [
            base,
            { ...base, id: "order-2", pickupNumber: 2, status: "cooking", totalAmount: 3000,
                items: [{ menuNameKo: "꿀호떡", options: [], quantity: 1, lineTotal: 3000 }] },
            { ...base, id: "order-3", pickupNumber: 3, status: "completed", totalAmount: 4000,
                completedAt: "2026-10-07T01:00:00Z",
                items: [{ menuNameKo: "불닭", options: [], quantity: 2, lineTotal: 4000 }] },
            { ...base, id: "order-4", pickupNumber: 4, status: "refunded", totalAmount: 2000,
                reason: "고객 요청", items: [{ menuNameKo: "기본호떡", options: [], quantity: 1, lineTotal: 2000 }] },
            { ...base, id: "order-5", pickupNumber: 5, status: "pending", totalAmount: 2000,
                items: [{ menuNameKo: "기본호떡", options: [], quantity: 1, lineTotal: 2000 }] },
        ];
        const csv = buildOrdersCsv(orders, { from: "2026-10-07", to: "2026-10-07" });
        const stats = aggregateStats(orders.map(order => ({
            id: order.id, status: order.status, totalAmount: order.totalAmount,
            createdAt: order.createdAt, items: [],
        })), "2026-10-07");
        expect(csv.sales).toBe(stats.sales);
        expect(csv.rowCount).toBe(6);
        expect(csv.content).toContain("order-1,1,2026-10-07 00:00:00,기본호떡,견과류,1,2000,현금,결제확인,,5000,2026-10-07 00:01:00,");
        expect(csv.content).toContain("뿌링클,치즈;꿀,1,3000");
        expect(csv.content).toContain("환불,고객 요청");
    });

    it("filters by inclusive KST dates and rejects invalid or reversed dates", () => {
        const before = { ...base, id: "before", createdAt: "2026-10-06T14:59:59Z" };
        const after = { ...base, id: "after", createdAt: "2026-10-07T15:00:00Z" };
        const result = buildOrdersCsv([before, base, after], { from: "2026-10-07", to: "2026-10-07" });
        expect(result.rowCount).toBe(2);
        expect(result.content).not.toContain("before,");
        expect(result.content).not.toContain("after,");
        expect(() => buildOrdersCsv([], { from: "2026-10-08", to: "2026-10-07" })).toThrow(RangeError);
        expect(() => buildOrdersCsv([], { from: "2026-02-30", to: "2026-10-07" })).toThrow(RangeError);
    });

    it("includes dates outside the festival for an all-time export", () => {
        const before = { ...base, id: "before", createdAt: "2026-09-28T00:00:00Z" };
        const after = { ...base, id: "after", createdAt: "2026-10-09T00:00:00Z" };
        const orders = [before, base, after];
        const csv = buildOrdersCsv(orders, { from: "all", to: "all" });
        const stats = aggregateStats(orders.map(order => ({
            id: order.id, status: order.status, totalAmount: order.totalAmount,
            createdAt: order.createdAt, items: [],
        })), "all");
        expect(csv.rowCount).toBe(6);
        expect(csv.sales).toBe(stats.sales);
        expect(csv.content).toContain("before,");
        expect(csv.content).toContain("after,");
    });

    it("quotes CSV controls and neutralizes spreadsheet formulas", () => {
        const order: CsvOrder = {
            ...base, status: "refunded", reason: "-환불, \"요청\"",
            items: [{ menuNameKo: "=SUM(1,1)", options: ["@악성", "줄\n바꿈"], quantity: 1, lineTotal: 5000 }],
        };
        const csv = buildOrdersCsv([order]).content;
        expect(csv).toContain("\"'=SUM(1,1)\"");
        expect(csv).toContain("\"'@악성;줄\n바꿈\"");
        expect(csv).toContain("\"'-환불, \"\"요청\"\"\"");
    });

    it("rejects inconsistent order totals instead of exporting a misleading sales figure", () => {
        expect(() => buildOrdersCsv([{ ...base, totalAmount: 6000 }])).toThrow("Order item total mismatch");
    });
});
