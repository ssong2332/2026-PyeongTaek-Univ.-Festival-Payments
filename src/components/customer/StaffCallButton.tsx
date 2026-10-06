"use client";

import { Bell } from "lucide-react";
import { useStaffCall } from "@/features/customer/useStaffCall";
import { useT } from "@/lib/i18n/locale";

interface StaffCallButtonProps {
  token: string;
}

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

  return (
    <section aria-labelledby="staff-call-heading" className="rounded-3xl border border-[#F3E7DA] bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="staff-call-heading" className="text-base font-bold text-neutral-900">
            {t("staffCall.title")}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-600">
            {t("staffCall.body")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void callStaff()}
          disabled={isCooldown || isCalling}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deep ${
            isCooldown || isCalling
              ? "cursor-not-allowed bg-neutral-100 text-neutral-600"
              : "bg-badge/30 text-brand-deep hover:bg-badge/50 active:bg-badge/60"
          }`}
        >
          <Bell className="h-4 w-4" />
          {isCalling
            ? t("staffCall.calling")
            : isCooldown
            ? t("staffCall.wait", { time: formatCooldown(cooldownRemaining) })
            : t("staffCall.button")}
        </button>
      </div>

      {message && (
        <p role="status" className="mt-2 text-xs font-medium text-emerald-600">
          {message}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="mt-2 text-xs font-medium text-amber-600">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
