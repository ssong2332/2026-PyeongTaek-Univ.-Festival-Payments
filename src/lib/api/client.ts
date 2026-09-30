import { AppError, type ErrorCode } from "./errors";
import {
  CreateOrderResponseSchema,
  type CreateOrderRequest,
  type CreateOrderResponse,
} from "@/lib/dto/order";

// 브라우저에서 우리 API를 부르는 공용 함수 (Architecture "lib/api/client.ts").
// 실패는 AppError(code, status, details)로 던진다 — features/* 훅이 { status: 'error', code }로 상태화한다.

// DECISIONS #24 (F-13): 타임아웃 8초, 네트워크 오류·타임아웃·5xx만 자동 2회(1초·2초 뒤), 4xx는 재시도 없음.
const TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [1_000, 2_000];

// 응답을 받지 못함(네트워크 오류·타임아웃). 문서에 별도 코드가 없어 INTERNAL_ERROR + 상태 0으로 표시한다.
const NO_RESPONSE = 0;

type ErrorEnvelope = { error?: { code?: ErrorCode; details?: unknown } };

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; parse?: (data: unknown) => T } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new AppError("INTERNAL_ERROR", NO_RESPONSE);
  } finally {
    clearTimeout(timer);
  }

  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = (data as ErrorEnvelope | undefined)?.error;
    throw new AppError(error?.code ?? "INTERNAL_ERROR", response.status, error?.details);
  }
  if (!options.parse) return data as T;
  try {
    return options.parse(data);
  } catch {
    // 성공 응답이 계약과 다름 — 다시 보내도 같은 결과라 재시도하지 않는다.
    throw new AppError("INTERNAL_ERROR", response.status);
  }
}

// 주문 생성 (Architecture "고객 주문 생성"). 재시도해도 같은 본문(같은 멱등키)이라 주문은 1건만 생긴다(F-08).
export async function postOrderWithRetry(body: CreateOrderRequest): Promise<CreateOrderResponse> {
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJson("/api/orders", init, { parse: (data) => CreateOrderResponseSchema.parse(data) });
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(error)) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof AppError && (error.status === NO_RESPONSE || error.status >= 500);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
