import { describe, expect, test, vi } from "vitest";
import { createSupabaseManualOrderRepository } from "@/infra/repositories/supabaseManualOrderRepository";
import { AppError } from "@/lib/api/errors";

// T-28: DB 함수 create_manual_order의 결과·실패를 API 계약으로 옮기는 부분. 실제 DB 동작은 tests/integration/t28-manual-orders.test.ts.
const input = {
    idempotencyKey: "3f0e7b3a-5c1d-4e6f-8a9b-0c1d2e3f4a5b", paymentMethod: "cash" as const,
    manualOrderedAt: "2026-10-07T03:00:00.000Z", manualNumber: 7, actorId: "33333333-3333-3333-3333-333333333333",
    items: [{ menuItemId: "11111111-1111-1111-1111-111111111111", quantity: 1, optionIds: [] }],
};
const row = {
    orderId: "22222222-2222-2222-2222-222222222222", manualNumber: 7, status: "completed", paymentMethod: "cash",
    totalAmount: 2000, manualOrderedAt: "2026-10-07T03:00:00+00:00", createdAt: "2026-10-07T04:00:00.123456+00:00",
    created: true, stockShortages: [],
};

function repositoryWith(result: { data: unknown; error: unknown }) {
    const rpc = vi.fn(async () => result);
    return { rpc, repository: createSupabaseManualOrderRepository({ rpc } as never) };
}

describe("SupabaseManualOrderRepository", () => {
    test("DB 함수에 입력을 넘기고 결과를 응답 계약으로 바꾼다(시각은 UTC ISO, 번호는 M- 표시 포함)", async () => {
        const { rpc, repository } = repositoryWith({ data: row, error: null });

        const result = await repository.createManualOrder(input);

        expect(rpc).toHaveBeenCalledExactlyOnceWith("create_manual_order", {
            p_idempotency_key: input.idempotencyKey, p_payment_method: "cash",
            p_manual_ordered_at: input.manualOrderedAt, p_manual_number: 7, p_actor_id: input.actorId,
            p_items: input.items,
        });
        expect(result).toEqual({
            ...row, displayNumber: "M-007",
            manualOrderedAt: "2026-10-07T03:00:00.000Z", createdAt: "2026-10-07T04:00:00.123Z",
        });
    });

    test.each([
        ["MANUAL_NUMBER_TAKEN", "MANUAL_NUMBER_TAKEN", 409],
        ["MENU_UNAVAILABLE", "MENU_UNAVAILABLE", 409],
        ["INVALID_OPTION", "INVALID_OPTION", 409],
        ["EMPTY_ITEMS", "VALIDATION_ERROR", 400],
        ["INVALID_ITEMS", "VALIDATION_ERROR", 400],
        ["INVALID_MANUAL_ORDERED_AT", "VALIDATION_ERROR", 400],
        ["INVALID_MANUAL_NUMBER", "VALIDATION_ERROR", 400],
        ["IDEMPOTENCY_KEY_CONFLICT", "VALIDATION_ERROR", 400],
    ])("DB 실패 %s → %s (%s)", async (message, code, status) => {
        const { repository } = repositoryWith({
            data: null, error: { message, code: "P0001", details: JSON.stringify({ manualNumber: 7 }) },
        });

        const error = await repository.createManualOrder(input).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ code, status, details: { manualNumber: 7 } });
    });

    test("알 수 없는 DB 오류와 예상 밖 응답은 AppError가 아닌 일반 오류다(핸들러가 500으로 숨긴다)", async () => {
        const failed = repositoryWith({ data: null, error: { message: "connection reset", code: "08006" } });
        const odd = repositoryWith({ data: { ...row, totalAmount: -1 }, error: null });

        for (const { repository } of [failed, odd]) {
            const error = await repository.createManualOrder(input).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(Error);
            expect(error).not.toBeInstanceOf(AppError);
        }
    });
});
