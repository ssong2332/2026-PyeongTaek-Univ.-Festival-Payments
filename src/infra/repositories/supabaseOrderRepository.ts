import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type ErrorCode } from "@/lib/api/errors";
import type { OrderRepository } from "@/services/ports";
import { toOrderForTransition } from "./mappers";

// DB 함수가 RAISE EXCEPTION으로 던지는 메시지 → AppError (Architecture "DB 함수" 표).
const DB_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
  STATE_CHANGED: { code: "STATE_CHANGED", status: 409 },
  ORDER_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  // 종료 상태는 상태 머신이 먼저 막는다. 여기까지 왔다면 불허 전환과 같다.
  TERMINAL_STATE: { code: "INVALID_TRANSITION", status: 409 },
};

type DbError = { message: string; code?: string };

// AppError로 바꾸지 못한 DB 에러는 일반 Error로 던진다 — withHandler가 기록하고 500으로 숨긴다.
function toError(operation: string, error: DbError): Error {
  const known = DB_ERRORS[error.message];
  if (known) return new AppError(known.code, known.status);
  return new Error(`${operation} failed: ${error.code ?? "unknown"} ${error.message}`);
}

export function createSupabaseOrderRepository(client: SupabaseClient): Pick<OrderRepository, "findById" | "transition"> {
  return {
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
  };
}
