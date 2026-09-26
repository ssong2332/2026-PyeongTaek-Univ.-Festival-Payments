import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import type { OrderRepository } from "@/services/ports";
import { toCreateOrderResponse, toExistingOrderResponse, toOrderForTransition } from "./mappers";

// DB 함수가 RAISE EXCEPTION으로 던지는 메시지 → AppError (Architecture "DB 함수" 표, ADR-0002).
const DB_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
  // create_order
  OUT_OF_STOCK: { code: "OUT_OF_STOCK", status: 409 },
  MENU_UNAVAILABLE: { code: "MENU_UNAVAILABLE", status: 409 },
  INVALID_OPTION: { code: "INVALID_OPTION", status: 409 },
  EMPTY_ITEMS: { code: "VALIDATION_ERROR", status: 400 },
  // 항목 형식 오류. zod가 먼저 막지만 DB에서 올라와도 500이 되지 않게 한다(0010).
  INVALID_ITEMS: { code: "VALIDATION_ERROR", status: 400 },
  // transition_order
  STATE_CHANGED: { code: "STATE_CHANGED", status: 409 },
  ORDER_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  // 종료 상태는 상태 머신이 먼저 막는다. 여기까지 왔다면 불허 전환과 같다.
  TERMINAL_STATE: { code: "INVALID_TRANSITION", status: 409 },
};

type DbError = { message: string; code?: string; details?: string | null };

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
function toError(operation: string, error: DbError): Error {
  const known = DB_ERRORS[error.message];
  if (known) return new AppError(known.code, known.status, parseDetail(error.details));
  return new Error(`${operation} failed: ${error.code ?? "unknown"} ${error.message}`);
}

export function createSupabaseOrderRepository(
  client: SupabaseClient,
): Pick<OrderRepository, "createOrder" | "findByIdempotencyKey" | "findById" | "transition" | "reportTransfer"> {
  return {
    async findByIdempotencyKey(key) {
      const { data, error } = await client
        .from("orders")
        .select("id, pickup_number, status_token, status, total_amount, created_at")
        .eq("idempotency_key", key)
        .maybeSingle();
      if (error) throw toError("orders.findByIdempotencyKey", error);
      return data ? toExistingOrderResponse(data) : null;
    },

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

    async findById(id) {
      const { data, error } = await client.from("orders").select("id, status, payment_method").eq("id", id).maybeSingle();
      if (error) throw toError("orders.findById", error);
      return data ? toOrderForTransition(data) : null;
    },

    async transition(command) {
      const { data, error } = await client.rpc("transition_order", {
        p_order_id: command.orderId,
        p_from: command.from,
        p_to: command.to,
        p_action: command.action,
        p_actor_type: command.actorType,
        p_actor_id: command.actorId,
        p_reason: command.reason,
        p_refund_channel: command.refundChannel,
      });
      if (error) throw toError("transition_order", error);
      return toOrderForTransition(data);
    },

    async reportTransfer(token, at) {
      // 조건이 맞는 행만 갱신한다(결제대기·계좌이체·미신고). 동시 요청이어도 한 건만 갱신된다.
      const { data: updated, error: updateError } = await client
        .from("orders")
        .update({ transfer_reported_at: at.toISOString() })
        .eq("status_token", token)
        .eq("status", "pending")
        .eq("payment_method", "transfer")
        .is("transfer_reported_at", null)
        .select("transfer_reported_at");
      if (updateError) throw toError("orders.reportTransfer", updateError);
      if (updated.length > 0) {
        return { outcome: "reported", transferReportedAt: new Date(updated[0].transfer_reported_at).toISOString() };
      }

      // 갱신되지 않은 이유를 가린다: 없음 / 신고 불가 / 이미 신고됨
      const { data: order, error: selectError } = await client
        .from("orders")
        .select("status, payment_method, transfer_reported_at")
        .eq("status_token", token)
        .maybeSingle();
      if (selectError) throw toError("orders.reportTransfer", selectError);
      if (!order) return { outcome: "not_found" };
      if (order.status !== "pending" || order.payment_method !== "transfer" || !order.transfer_reported_at) {
        return { outcome: "not_allowed" };
      }
      return { outcome: "already_reported", transferReportedAt: new Date(order.transfer_reported_at).toISOString() };
    },
  };
}
