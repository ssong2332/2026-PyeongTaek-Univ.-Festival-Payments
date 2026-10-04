import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createSupabaseReviewRepository } from "@/infra/repositories/supabaseReviewRepository";

function repository(result: { data: unknown; error: { code: string; message: string } | null }) {
    const query = {
        select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result),
    };
    const client = { from: vi.fn(() => query) } as unknown as SupabaseClient;
    return createSupabaseReviewRepository(client);
}
it.each(["42501", "23514", "XX000"])("관련 없는 DB 오류 %s는 고정 500으로 숨김", async (code) => {
    const repo = repository({ data: null, error: { code, message: "sensitive database detail" } });
    await expect(repo.insert({ orderId: "11111111-1111-4111-8111-111111111111", rating: 4, text: null }))
        .rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500, details: undefined });
});
it.each([null, { created_at: "invalid timestamp" }])("잘못된 저장 응답은 201로 내보내지 않음: %#", async (data) => {
    const repo = repository({ data, error: null });
    await expect(repo.insert({ orderId: "11111111-1111-4111-8111-111111111111", rating: 4, text: null }))
        .rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
});
it("알 수 없는 주문 상태는 고정 500으로 처리", async () => {
    const repo = repository({ data: { id: "11111111-1111-4111-8111-111111111111", status: "unexpected" }, error: null });
    await expect(repo.findOrderByToken("a".repeat(64))).rejects.toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
});
