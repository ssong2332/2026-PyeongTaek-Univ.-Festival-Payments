import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseReportRepository } from "@/infra/repositories/supabaseReportRepository";

type Page = { data: unknown[] | null; error: { code: string } | null };

function reviewClient(pages: Page[]) {
    const query = { select: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    for (const page of pages) query.range.mockResolvedValueOnce(page);
    const from = vi.fn().mockReturnValue(query);
    return { client: { from } as unknown as SupabaseClient, from, query };
}

const customerRow = {
    rating: 4, text: "맛있어요", created_at: "2026-10-07T03:30:00.123456+00:00",
    orders: { pickup_number: 12, manual_number: null, manual_ordered_at: null, created_at: "2026-10-07T03:00:00.5+00:00" },
};
const manualRow = {
    rating: 5, text: null, created_at: "2026-10-08T01:00:00+00:00",
    orders: {
        pickup_number: 2_100_000_001, manual_number: 1,
        manual_ordered_at: "2026-10-07T14:59:59+00:00", created_at: "2026-10-08T00:30:00+00:00",
    },
};

describe("createSupabaseReportRepository", () => {
    it("reads one day through the T-21 get_stats function", async () => {
        const summary = { date: "2026-10-07", sales: 0 };
        const rpc = vi.fn().mockResolvedValue({ data: summary, error: null });
        const repository = createSupabaseReportRepository({ rpc } as unknown as SupabaseClient);
        expect(await repository.loadDailyStats("2026-10-07")).toBe(summary);
        expect(rpc).toHaveBeenCalledWith("get_stats", { p_date: "2026-10-07" });
    });

    it("hides a get_stats failure behind INTERNAL_ERROR", async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023" } });
        const repository = createSupabaseReportRepository({ rpc } as unknown as SupabaseClient);
        await expect(repository.loadDailyStats("2026-10-07")).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });

    it("maps reviews with the order date rule (manual orders use the paper order time) and UTC timestamps", async () => {
        const { client, from, query } = reviewClient([{ data: [customerRow, manualRow], error: null }]);
        const reviews = await createSupabaseReportRepository(client).listReviews();

        expect(from).toHaveBeenCalledWith("reviews");
        expect(query.select.mock.calls[0][0]).toContain("orders");
        expect(query.select.mock.calls[0][0]).toContain("manual_ordered_at");
        expect(query.range).toHaveBeenCalledWith(0, 499);
        expect(reviews).toEqual([
            { pickupNumber: 12, manualNumber: null, orderedAt: "2026-10-07T03:00:00.500Z",
                rating: 4, text: "맛있어요", createdAt: "2026-10-07T03:30:00.123Z" },
            { pickupNumber: 2_100_000_001, manualNumber: 1, orderedAt: "2026-10-07T14:59:59.000Z",
                rating: 5, text: null, createdAt: "2026-10-08T01:00:00.000Z" },
        ]);
    });

    it("pages through more than 500 reviews and returns an empty list when there are none", async () => {
        const full = Array.from({ length: 500 }, () => customerRow);
        const paged = reviewClient([{ data: full, error: null }, { data: [manualRow], error: null }]);
        expect(await createSupabaseReportRepository(paged.client).listReviews()).toHaveLength(501);
        expect(paged.query.range.mock.calls).toEqual([[0, 499], [500, 999]]);

        const empty = reviewClient([{ data: [], error: null }]);
        expect(await createSupabaseReportRepository(empty.client).listReviews()).toEqual([]);
        expect(empty.query.range).toHaveBeenCalledTimes(1);
    });

    it("hides a review query failure behind INTERNAL_ERROR", async () => {
        const { client } = reviewClient([{ data: null, error: { code: "42P01" } }]);
        await expect(createSupabaseReportRepository(client).listReviews())
            .rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });

    it.each([
        { ...customerRow, rating: 6 },
        { ...customerRow, created_at: "2026-10-07 03:30:00" },
        { ...customerRow, orders: null },
        { ...customerRow, orders: { ...customerRow.orders, pickup_number: "12" } },
    ])("rejects a malformed review row", async row => {
        const { client } = reviewClient([{ data: [row], error: null }]);
        await expect(createSupabaseReportRepository(client).listReviews())
            .rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });
});
