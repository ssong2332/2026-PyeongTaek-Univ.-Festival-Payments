"use client";

import { useCallback, useState } from "react";
import { fetchJson } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { SubmitReviewResponseSchema } from "@/lib/dto/review";

// T-41 (F-37): POST /api/orders/{token}/reviews { rating, text } → 201 { createdAt }. 주문당 1건(409 REVIEW_ALREADY_SUBMITTED).
// 주문 조회 응답에 후기 여부가 없어서, 이 기기에서 낸 후기는 localStorage에 표시해 두고 폼을 다시 열지 않는다.
export const REVIEW_TEXT_MAX = 200;
const storageKey = (token: string) => `hotteok:review:${token}`;

function readSubmitted(token: string): boolean {
  try {
    return localStorage.getItem(storageKey(token)) !== null;
  } catch {
    return false;
  }
}

function markSubmitted(token: string) {
  try {
    localStorage.setItem(storageKey(token), "1");
  } catch {
    // 저장소를 못 써도 이번 화면에서는 제출됨으로 보인다.
  }
}

export type ReviewError = "notAllowed" | "failed";

// 이모지도 한 글자로 센다(서버의 char_length와 같은 기준).
export function reviewTextLength(text: string): number {
  return Array.from(text).length;
}

export function useReview(token: string) {
  const [submitted, setSubmitted] = useState(() => readSubmitted(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ReviewError | null>(null);

  const submit = useCallback(
    (rating: number, text: string) => {
      if (submitting || submitted) return;
      setSubmitting(true);
      setError(null);
      const trimmed = text.trim();
      fetchJson(
        `/api/orders/${token}/reviews`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, text: trimmed === "" ? null : trimmed }) },
        { parse: (data) => SubmitReviewResponseSchema.parse(data) },
      )
        .then(() => {
          markSubmitted(token);
          setSubmitted(true);
        })
        .catch((cause: unknown) => {
          if (cause instanceof AppError && cause.code === "REVIEW_ALREADY_SUBMITTED") {
            markSubmitted(token);
            setSubmitted(true);
            return;
          }
          setError(cause instanceof AppError && cause.status === 409 ? "notAllowed" : "failed");
        })
        .finally(() => setSubmitting(false));
    },
    [token, submitting, submitted],
  );

  return { submitted, submitting, error, submit };
}
