import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import type { OrderRepository } from "@/services/ports";
import { toCreateOrderResponse } from "./mappers";

// create_order가 RAISE EXCEPTION으로 던지는 메시지 → AppError (Architecture "DB 함수" 표, ADR-0002).
const CREATE_ORDER_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
  OUT_OF_STOCK: { code: "OUT_OF_STOCK", status: 409 },
  MENU_UNAVAILABLE: { code: "MENU_UNAVAILABLE", status: 409 },
  INVALID_OPTION: { code: "INVALID_OPTION", status: 409 },
  EMPTY_ITEMS: { code: "VALIDATION_ERROR", status: 400 },
};

type RpcError = { message: string; code?: string; details?: string | null };

// RAISE ... USING DETAIL = JSON 문자열이면 details로 넘긴다. 형식은 create_order 작성자(DB1)와 맞춘다.
function parseDetail(detail: string | null | undefined): unknown {
  if (!detail) return undefined;
  try {
    return JSON.parse(detail);
  } catch {
    return undefined;
  }
}

// AppError로 바꾸지 못한 DB 에러는 일반 Error로 던진다 — withHandler가 기록하고 500으로 숨긴다.
function toError(fn: string, error: RpcError): Error {
  const known = CREATE_ORDER_ERRORS[error.message];
  if (known) return new AppError(known.code, known.status, parseDetail(error.details));
  return new Error(`${fn} failed: ${error.code ?? "unknown"} ${error.message}`);
}

export function createSupabaseOrderRepository(client: SupabaseClient): Pick<OrderRepository, "createOrder"> {
  return {
    async createOrder(input) {
      const { data, error } = await client.rpc("create_order", {
        p_idempotency_key: input.idempotencyKey,
        p_payment_method: input.paymentMethod,
        p_locale: input.locale,
        p_items: input.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          optionIds: item.optionIds,
        })),
      });
      if (error) throw toError("create_order", error);
      return toCreateOrderResponse(data);
    },
  };
}
