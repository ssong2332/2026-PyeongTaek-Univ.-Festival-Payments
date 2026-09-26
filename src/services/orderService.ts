import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { OrderRepository } from "./ports";

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
