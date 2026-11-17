"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { SubmitReviewResponseSchema } from "@/lib/dto/review";

// T-41 (F-37): POST /api/orders/{token}/reviews { rating, text } → 201 { createdAt }. 주문당 1건(409 REVIEW_ALREADY_SUBMITTED).
// 주문 조회 응답에 후기 여부가 없어서, 이 기기에서 낸 후기는 24시간 표시해 두고 폼을 다시 열지 않는다.
// 표시 키에는 상태 조회 권한이 있는 전체 토큰을 남기지 않는다. 서버도 주문당 1건을 강제한다.
export const REVIEW_TEXT_MAX = 200;
const REVIEW_MARKER_TTL_MS = 24 * 60 * 60 * 1000;
const LEGACY_PREFIX = "hotteok:review:";
const MARKER_PREFIX = "hotteok:review:v2:";
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const MARKER_PATTERN = /^hotteok:review:v2:[0-9a-f]{24}$/;
const LEGACY_PATTERN = /^hotteok:review:[0-9a-f]{64}$/;
const storageKey = (token: string) => `${MARKER_PREFIX}${token.slice(0, 24)}`;

function isFresh(value: string | null, now: number): boolean {
  if (value === null || !/^\d+$/.test(value)) return false;
  const savedAt = Number(value);
  return Number.isSafeInteger(savedAt) && now >= savedAt && now - savedAt < REVIEW_MARKER_TTL_MS;
}

function readSubmitted(token: string): boolean {
  if (!TOKEN_PATTERN.test(token)) return false;
  try {
    return isFresh(localStorage.getItem(storageKey(token)), Date.now()) ||
      localStorage.getItem(`${LEGACY_PREFIX}${token}`) !== null;
  } catch {
    return false;
  }
}

function markSubmitted(token: string) {
  if (!TOKEN_PATTERN.test(token)) return;
  try {
    localStorage.setItem(storageKey(token), String(Date.now()));
  } catch {
    // 저장소를 못 써도 이번 화면에서는 제출됨으로 보인다.
  }
}

function cleanStoredMarkers(token: string) {
  try {
    // 기존 버전의 전체 토큰 키는 현재 주문의 제출 표시만 이전한 뒤 모두 지운다.
    if (TOKEN_PATTERN.test(token) && localStorage.getItem(`${LEGACY_PREFIX}${token}`) !== null) {
      markSubmitted(token);
    }
    const now = Date.now();
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key === null) continue;
      if (LEGACY_PATTERN.test(key) || (MARKER_PATTERN.test(key) && !isFresh(localStorage.getItem(key), now))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // 저장소가 막혀 있어도 후기 제출은 계속 가능하다.
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

  useEffect(() => {
    cleanStoredMarkers(token);
  }, [token]);

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
