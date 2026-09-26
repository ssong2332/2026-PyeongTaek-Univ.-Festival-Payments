import { describe, expect, it } from "vitest";
import { availableActions, resolveTransition } from "@/domain/order/stateMachine";
import type { OrderStatus, RefundChannel, TransitionAction } from "@/domain/order/status";

const statuses: OrderStatus[] = ["pending", "paid", "cooking", "completed", "cancelled", "refunded", "expired"];
const actions: TransitionAction[] = ["confirm_payment", "confirm_cash", "start_cooking", "complete", "auto_complete", "cancel", "refund", "expire"];
const allowed: Partial<Record<OrderStatus, Partial<Record<TransitionAction, OrderStatus>>>> = {
  pending: { confirm_payment: "paid", confirm_cash: "cooking", cancel: "cancelled", expire: "expired" },
  paid: { start_cooking: "cooking", cancel: "cancelled" },
  cooking: { complete: "completed", auto_complete: "completed", refund: "refunded" },
};

function order(status: OrderStatus) {
  return { status, paymentMethod: "transfer" as const };
}

describe("주문 상태 전환 표", () => {
  for (const status of statuses) {
    for (const action of actions) {
      it(`${status}에서 ${action} 허용 여부`, () => {
        const current = action === "confirm_cash"
          ? { status, paymentMethod: "cash" as const }
          : order(status);
        const result = resolveTransition(current, action, { reason: "고객 요청", refundChannel: "bank" });
        const to = allowed[status]?.[action];
        expect(result).toEqual(to ? {
          ok: true, to,
          restoreStock: ["cancel", "refund", "expire"].includes(action),
          needsReason: ["cancel", "refund"].includes(action),
          needsRefundChannel: action === "refund",
        } : { ok: false, code: "INVALID_TRANSITION" });
      });
    }
  }
});

it("현금 수령 확인 한 번으로 조리중이 된다", () => {
  const current = { status: "pending" as const, paymentMethod: "cash" as const };
  expect(resolveTransition(current, "confirm_cash", {})).toMatchObject({ ok: true, to: "cooking" });
  expect(resolveTransition(current, "confirm_payment", {})).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  expect(resolveTransition(order("pending"), "confirm_cash", {})).toEqual({ ok: false, code: "INVALID_TRANSITION" });
});

it.each([undefined, "", "  ", "\n\t"])("빈 취소·환불 사유를 거부한다: %s", (reason) => {
  for (const [status, action] of [["pending", "cancel"], ["paid", "cancel"], ["cooking", "refund"]] as const) {
    expect(resolveTransition(order(status), action, { reason, refundChannel: "bank" }))
      .toEqual({ ok: false, code: "REASON_REQUIRED" });
  }
});

it("환불수단이 없으면 거부한다", () => {
  expect(resolveTransition(order("cooking"), "refund", { reason: "고객 요청" }))
    .toEqual({ ok: false, code: "REFUND_CHANNEL_REQUIRED" });
});

it.each(["cash", "bank"] as const)("원래 결제 경로 %s로만 환불한다", (channel) => {
  const current = channel === "cash"
    ? { status: "cooking" as const, paymentMethod: "cash" as const }
    : { status: "cooking" as const, paymentMethod: "transfer" as const };
  for (const refundChannel of ["cash", "bank"] as const) {
    expect(resolveTransition(current, "refund", { reason: "고객 요청", refundChannel }).ok)
      .toBe(channel === refundChannel);
  }
});

it("관리자 버튼은 시스템 동작을 제외하고 사유 입력 전에도 취소·환불을 제공한다", () => {
  expect(availableActions(order("pending"))).toEqual(["confirm_payment", "cancel"]);
  expect(availableActions({ status: "pending", paymentMethod: "cash" })).toEqual(["confirm_cash", "cancel"]);
  expect(availableActions(order("paid"))).toEqual(["start_cooking", "cancel"]);
  expect(availableActions(order("cooking"))).toEqual(["complete", "refund"]);
  for (const status of ["completed", "cancelled", "refunded", "expired"] as const) {
    expect(availableActions(order(status))).toEqual([]);
  }
});

it("판정은 전달받은 주문을 변경하지 않는다", () => {
  const current = Object.freeze(order("pending"));
  resolveTransition(current, "confirm_payment", {});
  expect(current.status).toBe("pending");
});


it.each(["kakaopay", "toss"])("제외된 환불수단 %s를 거부한다", (channel) => {
  for (const paymentMethod of ["cash", "transfer"] as const) {
    expect(resolveTransition({ status: "cooking", paymentMethod }, "refund", {
      reason: "고객 요청", refundChannel: channel as RefundChannel,
    })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  }
});
