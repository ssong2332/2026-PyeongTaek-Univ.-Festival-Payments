import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { Clock, OrderRepository, RateLimitRepository } from "./ports";
import { ORDER_CREATE_RATE_LIMIT } from "@/domain/order/rateLimit";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export interface CreateOrderDeps {
  orderRepository: Pick<OrderRepository, "createOrder" | "findByIdempotencyKey">;
  rateLimitRepository?: RateLimitRepository;
  clientKey?: string;
  clock?: Clock;
}

// Architecture "고객 주문 생성". 가격 재계산·재고 차감·픽업 번호는 전부 DB 함수 create_order 안에서 한다.
export async function createOrder(
  dto: CreateOrderRequest,
  deps: CreateOrderDeps,
): Promise<CreateOrderResponse> {
  // ① 멱등키 선조회(T-08). 선조회와 생성 사이에 들어온 동시 재요청은 create_order가 created=false로 처리한다.
  const existing = await deps.orderRepository.findByIdempotencyKey(dto.idempotencyKey);
  if (existing) return existing;

  // ② 속도 제한(T-51) — 멱등 재요청은 한도를 쓰지 않는다(ADR-0009).
  if (deps.rateLimitRepository) {
    const clientKey = deps.clientKey ?? "unknown";
    const now = deps.clock ? deps.clock.now() : new Date();
    const limit = ORDER_CREATE_RATE_LIMIT.limit;
    const windowSeconds = ORDER_CREATE_RATE_LIMIT.windowSeconds;

    const allowed = await deps.rateLimitRepository.consume(
      "order_create",
      clientKey,
      limit,
      windowSeconds,
      now,
    );

    if (!allowed) {
      const nowSec = now.getTime() / 1000;
      const windowStart = Math.floor(nowSec / windowSeconds) * windowSeconds;
      const windowEnd = windowStart + windowSeconds;
      const retryAfterSeconds = Math.max(1, Math.ceil(windowEnd - nowSec));

      logger.warn("order.rate_limited", {
        keyPrefix: clientKey.slice(0, 8),
      });

      throw new AppError("RATE_LIMITED", 429, { retryAfterSeconds });
    }
  }

  // ③ 주문 생성
  return deps.orderRepository.createOrder(dto);
}
