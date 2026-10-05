"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { fetchJson } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";

// T-32 (F-43): POST /api/orders/{token}/transfer-report — 본문 없음, 200 { transferReportedAt }(이미 신고됨이면 기존 시각).
// 409는 결제대기가 아니게 됨(입금 확인·만료 등) — 다음 폴링이 새 상태를 보여 준다.
const TransferReportResponseSchema = z.object({ transferReportedAt: z.iso.datetime() });

export type TransferReportError = "stateChanged" | "failed";

export type UseTransferReportResult = {
  reportedAt: string | null;
  submitting: boolean;
  error: TransferReportError | null;
  report: () => void;
};

export function useTransferReport(
  token: string,
  serverReportedAt: string | null,
  onReported?: () => void,
): UseTransferReportResult {
  const [localReportedAt, setLocalReportedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<TransferReportError | null>(null);

  const report = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    fetchJson(
      `/api/orders/${token}/transfer-report`,
      { method: "POST" },
      { parse: (data) => TransferReportResponseSchema.parse(data) },
    )
      .then(({ transferReportedAt }) => {
        setLocalReportedAt(transferReportedAt);
        onReported?.();
      })
      .catch((cause: unknown) => {
        const changed = cause instanceof AppError && cause.status === 409;
        setError(changed ? "stateChanged" : "failed");
        if (changed) onReported?.();
      })
      .finally(() => setSubmitting(false));
  }, [token, submitting, onReported]);

  // 서버 값(최초 신고 시각)이 오면 그것을 우선한다.
  return { reportedAt: serverReportedAt ?? localReportedAt, submitting, error, report };
}
