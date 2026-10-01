"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderStatus } from "@/domain/order/status";
import { fetchJson } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { CreateOrderResponseSchema, OrderStatusDtoSchema, type OrderStatusDto } from "@/lib/dto/order";

// Architecture 8절 "주문 완료/상태" — GET /api/orders/{token} 5초 폴링
export const ORDER_STATUS_POLL_INTERVAL_MS = 5_000;

// 상태 머신에서 나가는 전환이 없는 상태 — 받으면 더 조회하지 않는다.
const FINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(["completed", "cancelled", "refunded", "expired"]);

// 주문 생성 응답의 statusToken과 같은 형식 규칙. 서버도 형식이 틀리면 404라 묻지 않고 바로 notFound로 둔다.
const statusTokenSchema = CreateOrderResponseSchema.shape.statusToken;

type OrderStatusState =
  | { status: "loading"; order: null; refreshFailed: false }
  | { status: "ready"; order: OrderStatusDto; refreshFailed: boolean }
  | { status: "notFound"; order: null; refreshFailed: false }
  | { status: "error"; order: null; refreshFailed: false };

export type UseOrderStatusResult = OrderStatusState & { retry: () => void };

const LOADING: OrderStatusState = { status: "loading", order: null, refreshFailed: false };
const NOT_FOUND: OrderStatusState = { status: "notFound", order: null, refreshFailed: false };
const ERROR: OrderStatusState = { status: "error", order: null, refreshFailed: false };

function isStatusToken(token: string): boolean {
  return statusTokenSchema.safeParse(token).success;
}

// 네트워크·5xx 실패는 폴링을 멈추지 않는다 — 다음 5초 조회가 곧 자동 재시도다.
// 이미 받은 주문이 있으면 픽업 번호를 가리지 않도록 그대로 두고 refreshFailed만 켠다.
export function useOrderStatus(token: string): UseOrderStatusResult {
  const [state, setState] = useState<OrderStatusState>(() => (isStatusToken(token) ? LOADING : NOT_FOUND));
  const pollNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isStatusToken(token)) return;

    let active = true;
    let inFlight = false;
    const url = `/api/orders/${token}`;

    function stop() {
      active = false;
      clearInterval(intervalId);
      pollNowRef.current = null;
    }

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const order = await fetchJson(url, { cache: "no-store" }, { parse: (data) => OrderStatusDtoSchema.parse(data) });
        if (!active) return;
        setState({ status: "ready", order, refreshFailed: false });
        if (FINAL_STATUSES.has(order.status)) stop();
      } catch (error) {
        if (!active) return;
        if (error instanceof AppError && error.status === 404) {
          setState(NOT_FOUND);
          stop();
          return;
        }
        setState((prev) => (prev.status === "ready" ? { ...prev, refreshFailed: true } : ERROR));
      } finally {
        inFlight = false;
      }
    }

    const intervalId = setInterval(() => void poll(), ORDER_STATUS_POLL_INTERVAL_MS);
    pollNowRef.current = () => void poll();
    void poll();

    return stop;
  }, [token]);

  const retry = useCallback(() => {
    setState((prev) => (prev.status === "error" ? LOADING : prev));
    pollNowRef.current?.();
  }, []);

  return { ...state, retry };
}
