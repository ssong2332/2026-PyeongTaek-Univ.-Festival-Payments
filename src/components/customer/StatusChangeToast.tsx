"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BanIcon, BellIcon, CardIcon, ClockIcon, FlameIcon } from "@/components/ui/icons";
import type { OrderStatus } from "@/domain/order/status";

const MESSAGES: Partial<Record<OrderStatus, { title: string; body: string; Icon: typeof BellIcon; tone: "warm" | "ok" | "cold" }>> = {
  paid: { title: "결제가 확인됐어요", body: "곧 호떡을 굽기 시작할게요.", Icon: CardIcon, tone: "warm" },
  cooking: { title: "호떡을 굽기 시작했어요", body: "지글지글, 조금만 기다려 주세요.", Icon: FlameIcon, tone: "warm" },
  completed: { title: "호떡이 완성됐어요", body: "부스에서 픽업 번호를 보여 주세요.", Icon: BellIcon, tone: "ok" },
  cancelled: { title: "주문이 취소됐어요", body: "궁금한 점은 부스 직원에게 문의해 주세요.", Icon: BanIcon, tone: "cold" },
  refunded: { title: "주문이 환불됐어요", body: "궁금한 점은 부스 직원에게 문의해 주세요.", Icon: BanIcon, tone: "cold" },
  expired: { title: "주문이 만료됐어요", body: "필요하면 메뉴에서 다시 주문해 주세요.", Icon: ClockIcon, tone: "cold" },
};
const TONE = {
  warm: "bg-syrup text-molasses",
  ok: "bg-ok text-iron",
  cold: "bg-iron-3 text-dough-dim",
};
const SHOW_MS = 3600;

// 화면을 보고 있는 동안 주문 상태가 바뀌면(폴링) 위에서 알림 카드가 내려와 아이콘이 한 번 흔들리고, 지원하는 폰은 짧게 진동한다.
// 처음 열었을 때의 상태는 알리지 않는다. 내용은 화면의 상태 알약이 aria-live로 이미 읽어 주므로 알림 자체는 장식이다.
export function StatusChangeToast({ status }: { status: OrderStatus }) {
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
            className="iron-card flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
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
              <p className="font-bold text-dough">{message.title}</p>
              <p className="text-sm text-dough-dim">{message.body}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
