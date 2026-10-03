"use client";

import { Bell, Check } from "lucide-react";
import type { StaffCallDto } from "@/lib/dto/staffCall";

interface StaffCallAlertProps {
  calls: StaffCallDto[];
  onAcknowledge: (id: string) => Promise<void>;
  isAcknowledging?: boolean;
}

export function StaffCallAlert({ calls, onAcknowledge, isAcknowledging = false }: StaffCallAlertProps) {
  const unacknowledged = calls.filter((c) => c.acknowledgedAt === null);

  if (unacknowledged.length === 0) {
    return null;
  }

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatPickup = (num: number) => String(num).padStart(3, "0");

  return (
    <aside aria-label="직원 호출 알림" className="mb-4 flex flex-col gap-2">
      {unacknowledged.map((call) => (
        <div
          key={call.id}
          className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 shadow-md transition-all animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-amber-950">
                픽업 <span className="text-amber-600">#{formatPickup(call.pickupNumber)}</span> 고객님이 직원을 호출했습니다!
              </p>
              <p className="text-xs text-amber-800">호출 시각: {formatTime(call.calledAt)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onAcknowledge(call.id)}
            disabled={isAcknowledging}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 active:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            확인
          </button>
        </div>
      ))}
    </aside>
  );
}
