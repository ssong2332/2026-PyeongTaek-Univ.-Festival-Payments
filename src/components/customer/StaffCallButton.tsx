"use client";

import { AnimatePresence, motion } from "motion/react";
import { BellIcon } from "@/components/ui/icons";
import { HotteokMascot } from "@/components/ui/HotteokMascot";
import { useStaffCall } from "@/features/customer/useStaffCall";
import { useT } from "@/lib/i18n/locale";

interface StaffCallButtonProps {
  token: string;
}

// T-27 직원 호출 — 철판 카드 + 확성기 든 호떡이. 누르면 종이 흔들리고, 대기 시간 동안 버튼에 남은 시간이 차오른다.
export function StaffCallButton({ token }: StaffCallButtonProps) {
  const t = useT();
  const { isCalling, cooldownRemaining, message, errorMessage, callStaff } = useStaffCall(token);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return secs > 0 ? t("staffCall.minSec", { min: mins, sec: secs }) : t("staffCall.min", { min: mins });
    }
    return t("staffCall.sec", { sec: secs });
  };

  const isCooldown = cooldownRemaining > 0;
  const busy = isCooldown || isCalling;

  return (
    <section aria-labelledby="staff-call-heading" className="iron-card relative overflow-hidden rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <HotteokMascot variant="megaphone" size={52} motion={isCalling ? "wiggle" : "sway"} />
        <div className="min-w-0 flex-1">
          <h2 id="staff-call-heading" className="font-display text-lg leading-tight text-dough">
            {t("staffCall.title")}
          </h2>
          <p className="mt-0.5 text-xs text-dough-dim">{t("staffCall.body")}</p>
        </div>
      </div>
      <motion.button
        type="button"
        onClick={() => void callStaff()}
        disabled={busy}
        whileTap={busy ? undefined : { scale: 0.96 }}
        className={`relative mt-4 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl text-[15px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup ${
          busy ? "cursor-not-allowed border border-iron-line bg-iron-2 text-dough-dim" : "syrup-btn sheen"
        }`}
      >
        <motion.span
          key={isCalling ? "ring" : "idle"}
          animate={isCalling ? { rotate: [0, -18, 16, -10, 8, 0] } : { rotate: 0 }}
          transition={{ duration: 0.7, repeat: isCalling ? Infinity : 0 }}
          className="flex"
        >
          <BellIcon className="size-[18px]" />
        </motion.span>
        <span className="relative">
          {isCalling ? t("staffCall.calling") : isCooldown ? t("staffCall.wait", { time: formatCooldown(cooldownRemaining) }) : t("staffCall.button")}
        </span>
      </motion.button>

      <AnimatePresence>
        {message && (
          <motion.p
            key="ok"
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-xl bg-ok/12 px-3 py-2 text-sm font-bold text-ok"
          >
            {message}
          </motion.p>
        )}
        {errorMessage && (
          <motion.p
            key="err"
            role="alert"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: [0, -5, 5, -2, 0] }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-xl bg-chili/12 px-3 py-2 text-sm font-bold text-chili"
          >
            {errorMessage}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
