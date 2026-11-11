"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SPRING, SPRING_BOUNCY } from "@/components/motion/presets";
import { BanIcon, ClockIcon } from "@/components/ui/icons";
import { useCancelRequest } from "@/features/customer/useCancelRequest";
import { useT } from "@/lib/i18n/locale";

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
  const t = useT();
  const cancel = useCancelRequest(token, cancelRequestedAt, onRequested);
  const [confirming, setConfirming] = useState(false);

  if (cancelRejectedAt) {
    return (
      <section aria-labelledby="cancel-heading" className={`${CARD} flex items-center gap-3`}>
        <div>
          <h2 id="cancel-heading" className="font-bold text-dough">
            {t("cancel.rejected.title")}
          </h2>
          <p className="mt-0.5 text-sm text-dough-dim">{t("cancel.rejected.body")}</p>
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
            {t("cancel.requested.title", { time: KST_TIME.format(new Date(cancel.requestedAt)) })}
          </h2>
          <p className="mt-0.5 text-sm text-dough-dim">{t("cancel.requested.body")}</p>
        </div>
      </motion.section>
    );
  }

  if (!canCancelRequest) return null;

  return (
    <section aria-labelledby="cancel-heading" className={CARD}>
      <h2 id="cancel-heading" className="sr-only">
        {t("cancel.heading")}
      </h2>
      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div key="confirm" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={SPRING}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-bold text-dough">
                {t("cancel.confirm.title")}
                <span className="mt-0.5 block font-normal text-dough-dim">{t("cancel.confirm.body")}</span>
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`h-12 rounded-2xl border border-iron-line bg-iron-2 font-bold text-dough-dim transition-transform active:scale-95 ${FOCUS_RING}`}
              >
                {t("cancel.confirm.keep")}
              </button>
              <button
                type="button"
                onClick={cancel.request}
                disabled={cancel.submitting}
                className={`h-12 rounded-2xl bg-chili font-bold text-white transition-transform active:scale-95 disabled:opacity-60 ${FOCUS_RING}`}
              >
                {cancel.submitting ? t("cancel.submitting") : t("cancel.submit")}
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
            {t("cancel.open")}
          </motion.button>
        )}
      </AnimatePresence>
      {cancel.error && (
        <p role="alert" className="mt-3 text-sm text-chili">
          {cancel.error === "notAllowed" ? t("cancel.notAllowed") : t("cancel.failed")}
        </p>
      )}
    </section>
  );
}
