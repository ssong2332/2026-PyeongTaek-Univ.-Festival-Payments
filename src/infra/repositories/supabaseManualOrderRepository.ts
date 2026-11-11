import type { SupabaseClient } from "@supabase/supabase-js";
import { formatManualNumber } from "@/domain/order/manualNumber";
import { toUtcIsoString } from "@/domain/time/utcIso";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import { ManualOrderResponseSchema, type ManualOrderResponse } from "@/lib/dto/manualOrder";
import type { ManualOrderRepository } from "@/services/ports";

type DbError = { message: string; code?: string; details?: string | null };

// DB 함수 create_manual_order(0104)가 RAISE EXCEPTION '<코드>'로 알리는 실패 → API 에러.
const DB_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
    MANUAL_NUMBER_TAKEN: { code: "MANUAL_NUMBER_TAKEN", status: 409 },
    MENU_UNAVAILABLE: { code: "MENU_UNAVAILABLE", status: 409 },
    INVALID_OPTION: { code: "INVALID_OPTION", status: 409 },
    // zod가 먼저 막지만 DB에서 올라와도 500이 되지 않게 한다.
    EMPTY_ITEMS: { code: "VALIDATION_ERROR", status: 400 },
    INVALID_ITEMS: { code: "VALIDATION_ERROR", status: 400 },
    INVALID_MANUAL_ORDERED_AT: { code: "VALIDATION_ERROR", status: 400 },
    INVALID_MANUAL_NUMBER: { code: "VALIDATION_ERROR", status: 400 },
    // 같은 멱등키가 고객 주문에 쓰인 경우 — 새 키로 다시 보내야 한다.
    IDEMPOTENCY_KEY_CONFLICT: { code: "VALIDATION_ERROR", status: 400 },
};

function parseDetail(detail: string | null | undefined): unknown {
    if (!detail) return undefined;
    try {
        return JSON.parse(detail);
    } catch {
        return undefined;
    }
}

// AppError로 바꾸지 못한 DB 에러는 일반 Error로 던진다 — withHandler가 기록하고 500으로 숨긴다.
function toError(error: DbError): Error {
    const known = DB_ERRORS[error.message];
    if (known) return new AppError(known.code, known.status, parseDetail(error.details));
    return new Error(`create_manual_order failed: ${error.code ?? "unknown"} ${error.message}`);
}

const isoOrRaw = (value: unknown) => (typeof value === "string" ? toUtcIsoString(value) : value);

// DB 결과 → API DTO. 필드를 명시해 나열하고 계약 스키마로 모양을 검사한다. 어긋나면 일반 Error → 500(내용 비노출).
function toManualOrderResponse(data: unknown): ManualOrderResponse {
    const row = (data ?? {}) as Record<string, unknown>;
    const parsed = ManualOrderResponseSchema.safeParse({
        orderId: row.orderId,
        manualNumber: row.manualNumber,
        displayNumber: typeof row.manualNumber === "number" ? formatManualNumber(row.manualNumber) : undefined,
        status: row.status,
        paymentMethod: row.paymentMethod,
        totalAmount: row.totalAmount,
        manualOrderedAt: isoOrRaw(row.manualOrderedAt),
        createdAt: isoOrRaw(row.createdAt),
        created: row.created,
        stockShortages: row.stockShortages,
    });
    if (!parsed.success) throw new Error("create_manual_order returned an unexpected shape");
    return parsed.data;
}

export function createSupabaseManualOrderRepository(client: SupabaseClient): ManualOrderRepository {
    return {
        async createManualOrder(input) {
            const { data, error } = await client.rpc("create_manual_order", {
                p_idempotency_key: input.idempotencyKey,
                p_payment_method: input.paymentMethod,
                p_manual_ordered_at: input.manualOrderedAt,
                p_manual_number: input.manualNumber,
                p_actor_id: input.actorId,
                p_items: input.items.map((item) => ({
                    menuItemId: item.menuItemId,
                    quantity: item.quantity,
                    optionIds: item.optionIds,
                })),
            });
            if (error) throw toError(error);
            return toManualOrderResponse(data);
        },
    };
}
