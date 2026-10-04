"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import type { StaffCallDto } from "@/lib/dto/staffCall";

interface StaffCallAlertProps {
  calls: StaffCallDto[];
  onAcknowledge: (id: string) => Promise<void>;
}

export function StaffCallAlert({ calls, onAcknowledge }: StaffCallAlertProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [errorId, setErrorId] = useState<string | null>(null);
  const unacknowledged = calls.filter((call) => call.acknowledgedAt === null && !confirmedIds.includes(call.id));

  async function acknowledge(id: string) {
    if (pendingId !== null) return;
    setPendingId(id);
    setErrorId(null);
    try {
      await onAcknowledge(id);
      setConfirmedIds((previous) => [...previous, id]);
    } catch {
      setErrorId(id);
    } finally {
      setPendingId(null);
    }
  }

  const formatTime = (isoString: string) => new Date(isoString).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const formatPickup = (num: number) => String(num).padStart(3, "0");

  return (
    <aside aria-label="직원 호출 알림" className="mb-4 flex flex-col gap-2">
      {unacknowledged.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          <Bell className="h-4 w-4" aria-hidden="true" /> 직원 호출 알림 없음
        </div>
      ) : unacknowledged.map((call) => (
        <div key={call.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white"><Bell className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <p className="text-base font-bold text-amber-950">픽업 <span className="text-amber-600">#{formatPickup(call.pickupNumber)}</span> 고객님이 직원을 호출했습니다!</p>
              <p className="text-xs text-amber-800">호출 시각: {formatTime(call.calledAt)}</p>
              {errorId === call.id && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">확인 처리에 실패했습니다. 다시 시도해 주세요.</p>}
            </div>
          </div>
          <button type="button" onClick={() => void acknowledge(call.id)} disabled={pendingId !== null} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Check className="h-4 w-4" aria-hidden="true" /> {pendingId === call.id ? "처리 중…" : "확인"}
          </button>
        </div>
      ))}
    </aside>
  );
}
