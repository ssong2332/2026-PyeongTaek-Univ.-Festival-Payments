"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { fetchJson } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";

// T-35 (F-45): POST /api/orders/{token}/cancel-request — 본문 없음, 200 { cancelRequestedAt }(이미 요청됨이면 기존 시각).
// 409 CANCEL_REQUEST_NOT_ALLOWED는 조리중 이후·거절됨 — 다음 폴링이 새 상태를 보여 준다.
const CancelRequestResponseSchema = z.object({ cancelRequestedAt: z.iso.datetime() });

export type CancelRequestError = "notAllowed" | "failed";

export function useCancelRequest(token: string, serverRequestedAt: string | null, onRequested?: () => void) {
  const [localRequestedAt, setLocalRequestedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<CancelRequestError | null>(null);

  const request = useCallback(() => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    fetchJson(
      `/api/orders/${token}/cancel-request`,
      { method: "POST" },
      { parse: (data) => CancelRequestResponseSchema.parse(data) },
    )
      .then(({ cancelRequestedAt }) => {
        setLocalRequestedAt(cancelRequestedAt);
        onRequested?.();
      })
      .catch((cause: unknown) => {
        const notAllowed = cause instanceof AppError && cause.status === 409;
        setError(notAllowed ? "notAllowed" : "failed");
        if (notAllowed) onRequested?.();
      })
      .finally(() => setSubmitting(false));
  }, [token, submitting, onRequested]);

  return { requestedAt: serverRequestedAt ?? localRequestedAt, submitting, error, request };
}
