"use client";

import type { OrderStatus } from "@/domain/order/status";
import { useT } from "@/lib/i18n/locale";

// PRD F-10·F-14 상태 표기 — 사전 status.{상태}.

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
  const t = useT();
  const tone = TONES[status];
  return (
    <span
      data-status={status}
      data-tone={tone}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold ${TONE_CLASS[tone].pill}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${TONE_CLASS[tone].dot}`} />
      {t(`status.${status}` as const)}
    </span>
  );
}
