import { describe, expect, it } from "vitest";
import { availableActions, hasPendingCancelRequest, resolveTransition } from "@/domain/order/stateMachine";
import { ADMIN_TRANSITION_ACTIONS, type OrderStatus, type RefundChannel, type TransitionAction } from "@/domain/order/status";

const statuses: OrderStatus[] = ["pending", "paid", "cooking", "completed", "cancelled", "refunded", "expired"];
const actions: TransitionAction[] = ["confirm_payment", "confirm_cash", "start_cooking", "complete", "auto_complete", "cancel", "refund", "expire"];
const allowed: Partial<Record<OrderStatus, Partial<Record<TransitionAction, OrderStatus>>>> = {
  pending: { confirm_payment: "cooking", confirm_cash: "cooking", cancel: "cancelled", expire: "expired" },
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

// DECISIONS #64(T-54): 계좌이체도 입금 확인 한 번으로 조리중 — 현금과 같은 흐름.
it("입금 확인 한 번으로 조리중이 된다", () => {
  const current = order("pending");
  expect(resolveTransition(current, "confirm_payment", {})).toMatchObject({ ok: true, to: "cooking" });
  expect(resolveTransition(current, "confirm_cash", {})).toEqual({ ok: false, code: "INVALID_TRANSITION" });
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

// 관리자 API 허용 목록(ADMIN_TRANSITION_ACTIONS)과 상태 머신의 actor: "admin" 규칙이 어긋나지 않게 고정한다.
// 상태 머신에 관리자 action이 추가·변경되면 이 테스트가 깨져 목록 갱신을 알린다.
it("ADMIN_TRANSITION_ACTIONS는 상태 머신의 관리자 action 전체와 같다", () => {
  const adminActions = new Set<TransitionAction>();
  for (const status of statuses) {
    for (const paymentMethod of ["cash", "transfer"] as const) {
      for (const action of availableActions({ status, paymentMethod })) adminActions.add(action);
    }
  }
  expect([...adminActions].sort()).toEqual([...ADMIN_TRANSITION_ACTIONS].sort());
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

// DECISIONS #71(T-54): 고객 취소 요청이 대기 중이면 조리중으로 들어가는 동작 3개를 막는다.
describe("취소 요청 대기 중 조리중 진입 차단", () => {
  const PENDING_REQUEST = { cancelRequestedAt: "2026-11-10T09:00:00.000Z", cancelRejectedAt: null };
  const REJECTED_REQUEST = { cancelRequestedAt: "2026-11-10T09:00:00.000Z", cancelRejectedAt: "2026-11-10T09:01:00.000Z" };
  const cases = [
    { action: "confirm_payment", status: "pending", paymentMethod: "transfer" },
    { action: "confirm_cash", status: "pending", paymentMethod: "cash" },
    { action: "start_cooking", status: "paid", paymentMethod: "transfer" },
  ] as const;

  it.each(cases)("대기 중이면 $action 거부 + 버튼 목록에서 빠진다", ({ action, status, paymentMethod }) => {
    const current = { status, paymentMethod, ...PENDING_REQUEST };
    expect(resolveTransition(current, action, {})).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(availableActions(current)).not.toContain(action);
    expect(availableActions(current)).toContain("cancel");
  });

  it.each(cases)("거절된 요청이면 $action 정상 허용", ({ action, status, paymentMethod }) => {
    const current = { status, paymentMethod, ...REJECTED_REQUEST };
    expect(resolveTransition(current, action, {})).toMatchObject({ ok: true, to: "cooking" });
    expect(availableActions(current)).toContain(action);
  });

  it("취소 요청 정보를 넘기지 않으면 지금과 같다(기존 호출부 호환)", () => {
    expect(availableActions(order("pending"))).toEqual(["confirm_payment", "cancel"]);
    expect(availableActions({ ...order("pending"), cancelRequestedAt: null, cancelRejectedAt: null }))
      .toEqual(["confirm_payment", "cancel"]);
  });

  it("대기 중이어도 취소(승인)는 사유와 함께 허용된다", () => {
    expect(resolveTransition({ ...order("pending"), ...PENDING_REQUEST }, "cancel", { reason: "고객 요청" }))
      .toMatchObject({ ok: true, to: "cancelled" });
  });

  it("hasPendingCancelRequest: 요청 있고 거절 없을 때만 참", () => {
    expect(hasPendingCancelRequest(PENDING_REQUEST)).toBe(true);
    expect(hasPendingCancelRequest(REJECTED_REQUEST)).toBe(false);
    expect(hasPendingCancelRequest({ cancelRequestedAt: null, cancelRejectedAt: null })).toBe(false);
    expect(hasPendingCancelRequest({})).toBe(false);
  });
});
