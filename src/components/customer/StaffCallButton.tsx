"use client";

import { Bell } from "lucide-react";
import { useStaffCall } from "@/features/customer/useStaffCall";

interface StaffCallButtonProps {
  token: string;
}

export function StaffCallButton({ token }: StaffCallButtonProps) {
  const { isCalling, cooldownRemaining, message, errorMessage, callStaff } = useStaffCall(token);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}분 ${secs > 0 ? `${secs}초` : ""}`;
    }
    return `${secs}초`;
  };

  const isCooldown = cooldownRemaining > 0;

  return (
    <section aria-labelledby="staff-call-heading" className="rounded-3xl border border-[#F3E7DA] bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 id="staff-call-heading" className="text-base font-bold text-neutral-900">
            도움이 필요하신가요?
          </h2>
          <p className="mt-0.5 text-xs text-neutral-600">
            문의사항이 있으시면 직원을 호출해 주세요.
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
            ? "호출 중…"
            : isCooldown
            ? `잠시 후 다시 호출 가능 (${formatCooldown(cooldownRemaining)})`
            : "직원 호출"}
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
