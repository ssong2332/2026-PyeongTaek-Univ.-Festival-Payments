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

// 헤더 그라데이션의 가장 밝은 쪽 위에서도 글씨 대비 4.5:1 이상이 되도록 배경을 거의 불투명하게 깐다.
// active는 캡처 12의 연두 글씨·점·테두리, closed는 같은 모양의 회색.
const TONE_CLASS: Record<Tone, { pill: string; dot: string }> = {
  active: { pill: "border-[#C2DFA7]/60 bg-brand-deep/90 text-[#C2DFA7]", dot: "bg-[#C2DFA7]" },
  closed: { pill: "border-neutral-400 bg-neutral-600 text-white", dot: "bg-neutral-300" },
};

// 주문 현황 헤더(갈색 그라데이션) 위에 놓이는 알약. 상태별 색을 더 나누려면 data-status를 쓴다.
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone = TONES[status];
  return (
    <span
      data-status={status}
      data-tone={tone}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${TONE_CLASS[tone].pill}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE_CLASS[tone].dot}`} />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
