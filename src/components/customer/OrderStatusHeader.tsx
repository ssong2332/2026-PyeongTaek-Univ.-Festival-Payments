"use client";

import { motion } from "motion/react";
import { ChevronLeftIcon } from "@/components/ui/icons";
import type { OrderStatus } from "@/domain/order/status";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { PickupNumberDisplay } from "./PickupNumberDisplay";

// 주문 현황 머리: 픽업 번호(시럽빛 큰 숫자) + 상태 알약 + 내 앞 대기 + 실시간 표시. aheadCount가 null이면 대기 알약을 숨긴다(종료 상태).
export function OrderStatusHeader({
  pickupNumber,
  status,
  aheadCount,
  onBack,
}: {
  pickupNumber: number;
  status: OrderStatus;
  aheadCount: number | null;
  onBack?: () => void;
}) {
  return (
    <header className="px-5 pt-5 pb-2">
      <h1 className="sr-only">주문 현황</h1>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="iron-card mb-4 flex h-10 items-center gap-1 rounded-xl pr-3 pl-2 text-sm font-semibold text-dough transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
        >
          <ChevronLeftIcon className="size-5" /> 뒤로
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <PickupNumberDisplay pickupNumber={pickupNumber} variant="header" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26, delay: 0.3 }}
          aria-live="polite"
          className="flex flex-col items-end gap-2 pb-1"
        >
          <OrderStatusBadge status={status} />
          {aheadCount !== null && (
            <span className="rounded-full border border-iron-line bg-iron-2 px-3 py-1.5 text-xs font-semibold text-dough">
              {aheadCount > 0 ? `내 앞 대기 ${aheadCount}건` : "대기 없음"}
            </span>
          )}
          {aheadCount !== null && <LiveRing />}
        </motion.div>
      </div>
    </header>
  );
}

// 5초마다 자동으로 다시 확인하고 있음을 보여 주는 "실시간" 표시(장식) — 링이 5초에 한 바퀴 채워진다.
function LiveRing() {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-dough-dim">
      <svg viewBox="0 0 20 20" className="size-3.5 -rotate-90">
        <circle cx="10" cy="10" r="7" fill="none" stroke="rgba(247,232,208,0.18)" strokeWidth="3" />
        <motion.circle
          cx="10"
          cy="10"
          r="7"
          fill="none"
          stroke="#a6db86"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        />
      </svg>
      실시간
    </span>
  );
}
