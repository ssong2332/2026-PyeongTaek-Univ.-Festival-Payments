import type {
  CreateOrderRequest,
  CreateOrderResponse,
  OrderStatusDto,
  QueueResponse,
} from "@/lib/dto/order";
import type { Clock, OrderRepository, RateLimitRepository } from "./ports";
import { ORDER_CREATE_RATE_LIMIT } from "@/domain/order/rateLimit";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { toUtcIsoString } from "@/domain/time/utcIso";

const STATUS_TOKEN_REGEX = /^[0-9a-f]{64}$/;

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

// Architecture "고객 API" GET /api/orders/{token} (T-11)
export async function getOrderByToken(
  token: string,
  deps: { orderRepository: Pick<OrderRepository, "findByToken" | "countWaitingBefore"> },
): Promise<OrderStatusDto> {
  // F-10: 토큰 형식 불일치·미존재 모두 404 (존재 여부를 구분하지 않음)
  if (!STATUS_TOKEN_REGEX.test(token)) {
    throw new AppError("NOT_FOUND", 404);
  }

  const order = await deps.orderRepository.findByToken(token);
  if (!order) {
    throw new AppError("NOT_FOUND", 404);
  }

  // DB 원본(µs) 그대로 넘긴다 — ms로 깎으면 같은 ms 안에 먼저 생성된 주문이 대기 수에서 빠진다.
  const aheadCount = await deps.orderRepository.countWaitingBefore(order.createdAt);

  const canTransferReport =
    order.status === "pending" &&
    order.paymentMethod === "transfer" &&
    order.transferReportedAt === null;

  const canCancelRequest =
    (order.status === "pending" || order.status === "paid") &&
    order.cancelRequestedAt === null &&
    order.cancelRejectedAt === null;

  return {
    orderId: order.id,
    pickupNumber: order.pickupNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    items: order.items,
    createdAt: toUtcIsoString(order.createdAt),
    transferReportedAt: toUtcIsoString(order.transferReportedAt),
    cancelRequestedAt: toUtcIsoString(order.cancelRequestedAt),
    cancelRejectedAt: toUtcIsoString(order.cancelRejectedAt),
    aheadCount,
    canTransferReport,
    canCancelRequest,
  };
}

// Architecture "POST /api/orders/{token}/transfer-report" · PRD F-43 (T-32).
// 주문 상태는 바꾸지 않고(결제대기 유지) 송금 신고 시각만 최초 1회 기록한다.
export async function reportTransfer(
  token: string,
  deps: { orderRepository: Pick<OrderRepository, "findByToken" | "setTransferReported"> },
): Promise<{ transferReportedAt: string }> {
  // 토큰 형식 불일치·미존재는 같은 404 (존재 여부를 구분하지 않음 — F-10)
  if (!STATUS_TOKEN_REGEX.test(token)) throw new AppError("NOT_FOUND", 404);

  const order = await deps.orderRepository.findByToken(token);
  if (!order) throw new AppError("NOT_FOUND", 404);
  if (!canReportTransfer(order)) throw new AppError("INVALID_TRANSITION", 409);
  // 이미 신고됨이면 처음 시각 그대로(멱등)
  if (order.transferReportedAt) return { transferReportedAt: toUtcIsoString(order.transferReportedAt) };

  const reportedAt = await deps.orderRepository.setTransferReported(order.id);
  if (reportedAt) return { transferReportedAt: toUtcIsoString(reportedAt) };

  // 기록되지 않음 = 조회 뒤에 다른 요청이 먼저 신고했거나 상태가 바뀜. 다시 읽어 판단한다.
  const latest = await deps.orderRepository.findByToken(token);
  if (latest && canReportTransfer(latest) && latest.transferReportedAt) {
    return { transferReportedAt: toUtcIsoString(latest.transferReportedAt) };
  }
  throw new AppError("INVALID_TRANSITION", 409);
}

// 현금 주문이거나 결제대기가 아니면 신고할 수 없다.
function canReportTransfer(order: { status: string; paymentMethod: string }): boolean {
  return order.status === "pending" && order.paymentMethod === "transfer";
}

// Architecture "POST /api/orders/{token}/cancel-request" · PRD F-45 (T-35).
// 주문 상태는 바꾸지 않고(결제대기·결제확인 유지) 취소 요청 시각만 최초 1회 기록한다. 승인·거절은 관리자가 한다.
export async function requestCancel(
  token: string,
  deps: { orderRepository: Pick<OrderRepository, "findByToken" | "setCancelRequested"> },
): Promise<{ cancelRequestedAt: string }> {
  // 토큰 형식 불일치·미존재는 같은 404 (존재 여부를 구분하지 않음 — F-10)
  if (!STATUS_TOKEN_REGEX.test(token)) throw new AppError("NOT_FOUND", 404);

  const order = await deps.orderRepository.findByToken(token);
  if (!order) throw new AppError("NOT_FOUND", 404);
  if (!canRequestCancel(order)) throw new AppError("CANCEL_REQUEST_NOT_ALLOWED", 409);
  // 이미 요청됨이면 처음 시각 그대로(멱등)
  if (order.cancelRequestedAt) return { cancelRequestedAt: toUtcIsoString(order.cancelRequestedAt) };

  const requestedAt = await deps.orderRepository.setCancelRequested(order.id);
  if (requestedAt) return { cancelRequestedAt: toUtcIsoString(requestedAt) };

  // 기록되지 않음 = 조회 뒤에 다른 요청이 먼저 기록했거나 상태가 바뀜. 다시 읽어 판단한다.
  const latest = await deps.orderRepository.findByToken(token);
  if (latest && canRequestCancel(latest) && latest.cancelRequestedAt) {
    return { cancelRequestedAt: toUtcIsoString(latest.cancelRequestedAt) };
  }
  throw new AppError("CANCEL_REQUEST_NOT_ALLOWED", 409);
}

// 조리중 이후이거나 이미 거절된 주문은 요청할 수 없다.
function canRequestCancel(order: { status: string; cancelRejectedAt: string | null }): boolean {
  return (order.status === "pending" || order.status === "paid") && order.cancelRejectedAt === null;
}

// Architecture "고객 API" GET /api/queue (T-11 메뉴판 주기 갱신용)
export async function getQueueStatus(
  deps: { orderRepository: Pick<OrderRepository, "countWaitingBefore"> },
): Promise<QueueResponse> {
  const waitingCount = await deps.orderRepository.countWaitingBefore(null);
  return { waitingCount };
}
