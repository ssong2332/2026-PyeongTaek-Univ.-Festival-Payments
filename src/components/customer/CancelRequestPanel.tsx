"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SPRING, SPRING_BOUNCY } from "@/components/motion/presets";
import { BanIcon, ClockIcon } from "@/components/ui/icons";
import { useCancelRequest } from "@/features/customer/useCancelRequest";

const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const CARD = "iron-card rounded-3xl p-5";
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup";

export interface CancelRequestPanelProps {
  token: string;
  canCancelRequest: boolean;
  cancelRequestedAt: string | null;
  cancelRejectedAt: string | null;
  // 요청 성공·409 뒤 주문 상태를 바로 다시 읽게 한다(useOrderStatus.retry).
  onRequested?: () => void;
}

// T-35 (F-45) 고객 취소 요청: 결제대기·결제확인에서만 버튼(canCancelRequest). 누르면 한 번 더 확인한 뒤 요청한다.
// 요청됨 → "직원이 확인 중", 거절됨 → "주문은 그대로 진행". 승인되면 주문이 취소 상태가 되어 화면이 바뀐다.
export function CancelRequestPanel({ token, canCancelRequest, cancelRequestedAt, cancelRejectedAt, onRequested }: CancelRequestPanelProps) {
  const cancel = useCancelRequest(token, cancelRequestedAt, onRequested);
  const [confirming, setConfirming] = useState(false);

  if (cancelRejectedAt) {
    return (
      <section aria-labelledby="cancel-heading" className={`${CARD} flex items-center gap-3`}>
        <div>
          <h2 id="cancel-heading" className="font-bold text-dough">
            취소 요청이 거절됐어요
          </h2>
          <p className="mt-0.5 text-sm text-dough-dim">이미 준비를 시작해서 주문은 그대로 진행돼요.</p>
        </div>
      </section>
    );
  }

  if (cancel.requestedAt) {
    return (
      <motion.section
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_BOUNCY}
        role="status"
        aria-labelledby="cancel-heading"
        className={`${CARD} flex items-center gap-3 border-syrup/40 bg-syrup/10`}
      >
        <div>
          <h2 id="cancel-heading" className="flex items-center gap-1.5 font-bold text-dough">
            <ClockIcon className="size-4 text-syrup" />
            취소 요청됨 {KST_TIME.format(new Date(cancel.requestedAt))}
          </h2>
          <p className="mt-0.5 text-sm text-dough-dim">직원이 확인하고 있어요. 승인되면 이 화면이 바뀌어요.</p>
        </div>
      </motion.section>
    );
  }

  if (!canCancelRequest) return null;

  return (
    <section aria-labelledby="cancel-heading" className={CARD}>
      <h2 id="cancel-heading" className="sr-only">
        주문 취소
      </h2>
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div key="confirm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={SPRING}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-bold text-dough">
                정말 취소를 요청할까요?
                <span className="mt-0.5 block font-normal text-dough-dim">직원이 확인한 뒤 취소돼요.</span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`h-12 rounded-2xl border border-iron-line bg-iron-2 font-bold text-dough-dim transition-transform active:scale-95 ${FOCUS_RING}`}
              >
                그만두기
              </button>
              <button
                type="button"
                onClick={cancel.request}
                disabled={cancel.submitting}
                className={`h-12 rounded-2xl bg-chili font-bold text-white transition-transform active:scale-95 disabled:opacity-60 ${FOCUS_RING}`}
              >
                {cancel.submitting ? "요청하는 중…" : "취소 요청하기"}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="open"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirming(true)}
            className={`flex w-full items-center justify-center gap-2 py-1 text-sm font-bold text-dough-dim ${FOCUS_RING}`}
          >
            <BanIcon className="size-4" />
            주문 취소 요청
          </motion.button>
        )}
      </AnimatePresence>
      {cancel.error && (
        <p role="alert" className="mt-3 text-sm text-chili">
          {cancel.error === "notAllowed" ? "지금은 취소를 요청할 수 없어요. 이미 굽기 시작했을 수 있어요." : "요청하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요."}
        </p>
      )}
    </section>
  );
}
