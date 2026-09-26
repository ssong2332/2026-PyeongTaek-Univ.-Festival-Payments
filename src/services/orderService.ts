import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { Clock, OrderRepository } from "./ports";

// 상태 페이지 토큰 형식(create_order가 발급하는 64자 16진수). 형식이 틀리면 DB를 부르지 않는다.
const STATUS_TOKEN = /^[0-9a-f]{64}$/;

// Architecture "고객 주문 생성" ③. 가격 재계산·재고 차감·픽업 번호는 전부 DB 함수 create_order 안에서 한다.
// ② 속도 제한(T-51)은 ①과 ③ 사이에 추가된다 — 멱등 재요청은 한도를 쓰지 않는다(ADR-0009).
export async function createOrder(
  dto: CreateOrderRequest,
  deps: { orderRepository: Pick<OrderRepository, "createOrder" | "findByIdempotencyKey"> },
): Promise<CreateOrderResponse> {
  // ① 멱등키 선조회(T-08). 선조회와 생성 사이에 들어온 동시 재요청은 create_order가 created=false로 처리한다.
  const existing = await deps.orderRepository.findByIdempotencyKey(dto.idempotencyKey);
  if (existing) return existing;

  // ③ 주문 생성
  return deps.orderRepository.createOrder(dto);
}

// Architecture "POST /api/orders/{token}/transfer-report" · PRD F-43 (T-32).
// 주문 상태는 바꾸지 않고(결제대기 유지) 송금 신고 시각만 최초 1회 기록한다.
export async function reportTransfer(
  token: string,
  deps: { orderRepository: Pick<OrderRepository, "reportTransfer">; clock: Clock },
): Promise<{ transferReportedAt: string }> {
  // 토큰 형식 불일치·미존재는 같은 404 (존재 여부를 구분하지 않음 — F-10)
  if (!STATUS_TOKEN.test(token)) throw new AppError("NOT_FOUND", 404);

  const result = await deps.orderRepository.reportTransfer(token, deps.clock.now());
  if (result.outcome === "not_found") throw new AppError("NOT_FOUND", 404);
  // 현금 주문이거나 결제대기가 아님
  if (result.outcome === "not_allowed") throw new AppError("INVALID_TRANSITION", 409);
  return { transferReportedAt: result.transferReportedAt };
}
