import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseAdminReviewRepository } from "@/infra/repositories/supabaseReviewRepository";

type Page = { data: unknown; error: { code: string; message: string } | null };

function repository(...pages: Page[]) {
    const range = vi.fn();
    for (const page of pages) range.mockResolvedValueOnce(page);
    const query = {
        select: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(), range,
    };
    const client = { from: vi.fn(() => query) } as unknown as SupabaseClient;
    return { repo: createSupabaseAdminReviewRepository(client), client, query };
}
const row = (index: number, extra: Record<string, unknown> = {}) => ({
    order_id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    rating: 4, text: "맛있어요", created_at: "2026-10-07T03:12:00.123456+00:00",
    orders: { pickup_number: index, manual_number: null }, ...extra,
});

describe("T-42 createSupabaseAdminReviewRepository", () => {
    it("후기와 주문 번호를 함께 읽어 최신순 DTO로 바꾼다", async () => {
        const { repo, client, query } = repository({ data: [
            row(7),
            row(8, { rating: 5, text: null, orders: { pickup_number: 2_100_000_001, manual_number: 1 } }),
        ], error: null });
        expect(await repo.listForAdmin(null)).toEqual([
            { orderId: "11111111-1111-4111-8111-000000000007", pickupNumber: 7, manualNumber: null,
                rating: 4, text: "맛있어요", createdAt: "2026-10-07T03:12:00.123Z" },
            { orderId: "11111111-1111-4111-8111-000000000008", pickupNumber: 2_100_000_001, manualNumber: 1,
                rating: 5, text: null, createdAt: "2026-10-07T03:12:00.123Z" },
        ]);
        expect(client.from).toHaveBeenCalledWith("reviews");
        expect(query.select).toHaveBeenCalledWith("order_id, rating, text, created_at, orders ( pickup_number, manual_number )");
        expect(query.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
        expect(query.order).toHaveBeenNthCalledWith(2, "order_id", { ascending: true });
        expect(query.range).toHaveBeenCalledWith(0, 499);
        expect(query.gte).not.toHaveBeenCalled();
        expect(query.lt).not.toHaveBeenCalled();
    });

    it("날짜 범위가 있으면 후기 작성 시각 [start, end)로 거른다", async () => {
        const { repo, query } = repository({ data: [], error: null });
        const range = { start: "2026-10-06T15:00:00.000Z", end: "2026-10-07T15:00:00.000Z" };
        expect(await repo.listForAdmin(range)).toEqual([]);
        expect(query.gte).toHaveBeenCalledWith("created_at", range.start);
        expect(query.lt).toHaveBeenCalledWith("created_at", range.end);
    });

    it("한 쪽(500건)이 가득 차면 다음 쪽까지 읽는다", async () => {
        const first = Array.from({ length: 500 }, (_, index) => row(index + 1));
        const { repo, query } = repository({ data: first, error: null }, { data: [row(501)], error: null });
        const reviews = await repo.listForAdmin(null);
        expect(reviews).toHaveLength(501);
        expect(query.range).toHaveBeenNthCalledWith(1, 0, 499);
        expect(query.range).toHaveBeenNthCalledWith(2, 500, 999);
    });

    it("DB 오류는 내용을 숨기고 고정 500으로 바꾼다", async () => {
        const { repo } = repository({ data: null, error: { code: "42501", message: "sensitive database detail" } });
        await expect(repo.listForAdmin(null)).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500, details: undefined });
    });

    it.each([
        row(1, { rating: 6 }),
        row(1, { rating: 0 }),
        row(1, { orders: null }),
        row(1, { created_at: "invalid timestamp" }),
        row(1, { text: 1 }),
    ])("규격 밖 행은 응답으로 내보내지 않는다: %#", async (bad) => {
        const { repo } = repository({ data: [bad], error: null });
        await expect(repo.listForAdmin(null)).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    });
});
