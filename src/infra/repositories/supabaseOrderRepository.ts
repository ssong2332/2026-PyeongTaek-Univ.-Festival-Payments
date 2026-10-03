import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import type { OrderRepository } from "@/services/ports";
import {
  toCreateOrderResponse,
  toExistingOrderResponse,
  toOrderForTransition,
  toOrderByTokenResult,
} from "./mappers";

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

const ORDER_BY_TOKEN_SELECT = `
  id, pickup_number, status, payment_method, total_amount, locale, created_at,
  transfer_reported_at, cancel_requested_at, cancel_rejected_at,
  order_items (
    menu_name_ko, menu_name_en, quantity, line_total, sort_order,
    order_item_options ( option_name_ko, option_name_en )
  )
`;

// 고객이 취소를 요청할 수 있고 관리자가 그 요청을 거절할 수 있는 상태(Architecture 상태 머신 표 — cancel_request·cancel_request_reject).
const CANCEL_REQUEST_STATUSES = ["pending", "paid"];

export function createSupabaseOrderRepository(
  client: SupabaseClient,
): OrderRepository {
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

    async findByToken(token) {
      const { data, error } = await client
        .from("orders")
        .select(ORDER_BY_TOKEN_SELECT)
        .eq("status_token", token)
        .maybeSingle();
      if (error) throw toError("orders.findByToken", error);
      return data ? toOrderByTokenResult(data) : null;
    },

    async countWaitingBefore(createdAt) {
      const { data, error } = await client.rpc("count_waiting_before", {
        p_created_at: createdAt ?? null,
      });
      if (error) throw toError("count_waiting_before", error);
      return typeof data === "number" ? data : 0;
    },

    async setTransferReported(id) {
      // 조건이 맞는 행만 갱신한다(결제대기·계좌이체·미신고). 동시 요청이어도 한 건만 갱신된다.
      const { data, error } = await client
        .from("orders")
        .update({ transfer_reported_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
        .eq("payment_method", "transfer")
        .is("transfer_reported_at", null)
        .select("transfer_reported_at");
      if (error) throw toError("orders.setTransferReported", error);
      // findByToken처럼 DB 시각 문자열 그대로 돌려준다 — 응답 표기(UTC ISO)는 서비스가 맞춘다.
      return data.length > 0 ? (data[0].transfer_reported_at as string) : null;
    },

    async setCancelRequested(id) {
      // 조건이 맞는 행만 갱신한다(결제대기·결제확인·미요청·미거절). 동시 요청이어도 한 건만 갱신된다.
      const { data, error } = await client
        .from("orders")
        .update({ cancel_requested_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", CANCEL_REQUEST_STATUSES)
        .is("cancel_requested_at", null)
        .is("cancel_rejected_at", null)
        .select("cancel_requested_at");
      if (error) throw toError("orders.setCancelRequested", error);
      return data.length > 0 ? (data[0].cancel_requested_at as string) : null;
    },

    async rejectCancelRequest(id, actorId, reason) {
      // ① 조건부 갱신이 거절 여부를 최종 결정한다 — 두 관리자가 동시에 눌러도 한 건만 갱신된다.
      const { data, error } = await client
        .from("orders")
        .update({ cancel_rejected_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", CANCEL_REQUEST_STATUSES)
        .not("cancel_requested_at", "is", null)
        .is("cancel_rejected_at", null)
        .select("status");
      if (error) throw toError("orders.rejectCancelRequest", error);
      if (data.length === 0) return false;

      // ② 이력 1행. 상태는 바뀌지 않으므로 from = to.
      const status = data[0].status as string;
      const { error: historyError } = await client.from("order_status_history").insert({
        order_id: id,
        from_status: status,
        to_status: status,
        action: "cancel_request_reject",
        actor_type: "admin",
        actor_id: actorId,
        reason,
      });
      if (!historyError) return true;
      // 응답은 500으로 숨기므로, 이력을 남기지 못한 원인을 여기서 기록한다.
      logger.error("order.cancel_request_reject.history_failed", historyError, { orderId: id });

      // ③ DB 함수가 아니라 ①·②가 한 트랜잭션이 아니다. 이력 없는 거절이 남지 않게 거절 시각을 되돌린다.
      const { error: rollbackError } = await client.from("orders").update({ cancel_rejected_at: null }).eq("id", id);
      if (rollbackError) {
        // 되돌리기도 실패 — 거절 시각만 있고 이력이 없는 주문이다. 운영자가 찾을 수 있게 주문 id를 남긴다.
        logger.error("order.cancel_request_reject.rollback_failed", rollbackError, { orderId: id });
      }
      throw new AppError("INTERNAL_ERROR", 500);
    },
  };
}
