import type { OrderStatus } from "@/domain/order/status";

// PRD F-10·F-14 상태 표기. 다국어 사전으로 옮기는 것은 T-04.
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "결제대기",
  paid: "결제확인",
  cooking: "조리중",
  completed: "완료",
  cancelled: "취소",
  refunded: "환불",
  expired: "만료",
};

type Tone = "active" | "closed";

const TONES: Record<OrderStatus, Tone> = {
  pending: "active",
  paid: "active",
  cooking: "active",
  completed: "active",
  cancelled: "closed",
  refunded: "closed",
  expired: "closed",
};

// 상태 알약: 진행 중이면 연두 점이 맥박처럼 뛰고, 끝난 주문은 식은 회색.
const TONE_CLASS: Record<Tone, { pill: string; dot: string }> = {
  active: { pill: "border-ok/40 bg-ok/10 text-ok", dot: "pulse-ok bg-ok" },
  closed: { pill: "border-iron-line bg-iron-2 text-dough-dim", dot: "bg-dough-dim" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone = TONES[status];
  return (
    <span
      data-status={status}
      data-tone={tone}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold ${TONE_CLASS[tone].pill}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${TONE_CLASS[tone].dot}`} />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
