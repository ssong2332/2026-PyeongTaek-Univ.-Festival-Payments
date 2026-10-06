"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BanIcon, BellIcon, CardIcon, ClockIcon, FlameIcon } from "@/components/ui/icons";
import type { OrderStatus } from "@/domain/order/status";
import { useT } from "@/lib/i18n/locale";

// 문구는 사전 toast.{상태}.title/body
type ToastStatus = "paid" | "cooking" | "completed" | "cancelled" | "refunded" | "expired";
const MESSAGES: Partial<Record<OrderStatus, { key: ToastStatus; Icon: typeof BellIcon; tone: "warm" | "ok" | "cold" }>> = {
  paid: { key: "paid", Icon: CardIcon, tone: "warm" },
  cooking: { key: "cooking", Icon: FlameIcon, tone: "warm" },
  completed: { key: "completed", Icon: BellIcon, tone: "ok" },
  cancelled: { key: "cancelled", Icon: BanIcon, tone: "cold" },
  refunded: { key: "refunded", Icon: BanIcon, tone: "cold" },
  expired: { key: "expired", Icon: ClockIcon, tone: "cold" },
};
const TONE = {
  warm: "bg-syrup text-molasses",
  ok: "bg-ok text-molasses",
  cold: "bg-iron-3 text-dough-dim",
};
const SHOW_MS = 3600;

// 화면을 보고 있는 동안 주문 상태가 바뀌면(폴링) 위에서 알림 카드가 내려와 아이콘이 한 번 흔들리고, 지원하는 폰은 짧게 진동한다.
// 처음 열었을 때의 상태는 알리지 않는다. 내용은 화면의 상태 알약이 aria-live로 이미 읽어 주므로 알림 자체는 장식이다.
export function StatusChangeToast({ status }: { status: OrderStatus }) {
  const t = useT();
  const previous = useRef(status);
  const [shown, setShown] = useState<{ status: OrderStatus; key: number } | null>(null);

  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    if (!MESSAGES[status]) return;
    // 상태가 바뀐 순간 알림을 한 번 띄운다(외부 신호 → 화면 반영).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ status, key: Date.now() });
    try {
      navigator.vibrate?.([30, 60, 30]);
    } catch {
      // 진동을 못 써도 알림은 보인다.
    }
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const message = shown ? MESSAGES[shown.status] : undefined;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <AnimatePresence>
        {shown && message && (
          <motion.div
            key={shown.key}
            initial={{ y: -90, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -90, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 26 }}
            className="iron-card iron-solid flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
          >
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -16, 12, -6, 0] }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONE[message.tone]}`}
            >
              <message.Icon className="size-5" />
            </motion.span>
            <div className="min-w-0">
              <p className="font-bold text-dough">{t(`toast.${message.key}.title` as const)}</p>
              <p className="text-sm text-dough-dim">{t(`toast.${message.key}.body` as const)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
