import type { OrderStatus, PaymentMethod, RefundChannel, TransferMethod, TransitionAction } from "./status";

export type TransitionOrder = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  transferMethod: TransferMethod | null;
};

export type TransitionResult =
  | { ok: true; to: OrderStatus; restoreStock: boolean; needsReason: boolean; needsRefundChannel: boolean }
  | { ok: false; code: "INVALID_TRANSITION" | "REASON_REQUIRED" | "REFUND_CHANNEL_REQUIRED" };

type TransitionRule = {
  from: readonly OrderStatus[];
  to: OrderStatus;
  actor: "admin" | "system";
  paymentMethod?: PaymentMethod;
  restoreStock: boolean;
  needsReason: boolean;
  needsRefundChannel: boolean;
};

const TRANSITIONS: Record<TransitionAction, TransitionRule> = {
  confirm_payment: { from: ["pending"], to: "paid", actor: "admin", paymentMethod: "transfer", restoreStock: false, needsReason: false, needsRefundChannel: false },
  confirm_cash: { from: ["pending"], to: "cooking", actor: "admin", paymentMethod: "cash", restoreStock: false, needsReason: false, needsRefundChannel: false },
  start_cooking: { from: ["paid"], to: "cooking", actor: "admin", restoreStock: false, needsReason: false, needsRefundChannel: false },
  complete: { from: ["cooking"], to: "completed", actor: "admin", restoreStock: false, needsReason: false, needsRefundChannel: false },
  auto_complete: { from: ["cooking"], to: "completed", actor: "system", restoreStock: false, needsReason: false, needsRefundChannel: false },
  cancel: { from: ["pending", "paid"], to: "cancelled", actor: "admin", restoreStock: true, needsReason: true, needsRefundChannel: false },
  refund: { from: ["cooking"], to: "refunded", actor: "admin", restoreStock: true, needsReason: true, needsRefundChannel: true },
  expire: { from: ["pending"], to: "expired", actor: "system", restoreStock: true, needsReason: false, needsRefundChannel: false },
};

function isAllowed(order: TransitionOrder, rule: TransitionRule): boolean {
  return rule.from.includes(order.status)
    && (!rule.paymentMethod || rule.paymentMethod === order.paymentMethod);
}

// 호출자 인증과 자동 전환의 시간·설정·송금 신고 조건은 호출하는 쪽에서 검증한다.
export function resolveTransition(
  order: TransitionOrder,
  action: TransitionAction,
  input: { reason?: string; refundChannel?: RefundChannel },
): TransitionResult {
  const rule = TRANSITIONS[action];
  if (!rule || !isAllowed(order, rule)) return { ok: false, code: "INVALID_TRANSITION" };
  if (rule.needsReason && !input.reason?.trim()) return { ok: false, code: "REASON_REQUIRED" };
  if (rule.needsRefundChannel) {
    if (!input.refundChannel) return { ok: false, code: "REFUND_CHANNEL_REQUIRED" };
    const expectedChannel = order.paymentMethod === "cash" ? "cash" : order.transferMethod;
    if (input.refundChannel !== expectedChannel) return { ok: false, code: "INVALID_TRANSITION" };
  }
  return {
    ok: true, to: rule.to, restoreStock: rule.restoreStock,
    needsReason: rule.needsReason, needsRefundChannel: rule.needsRefundChannel,
  };
}

export function availableActions(order: TransitionOrder): TransitionAction[] {
  return (Object.keys(TRANSITIONS) as TransitionAction[]).filter((action) => {
    const rule = TRANSITIONS[action];
    return rule.actor === "admin" && isAllowed(order, rule);
  });
}
