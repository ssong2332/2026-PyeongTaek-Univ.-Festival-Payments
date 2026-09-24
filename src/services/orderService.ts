import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { OrderRepository } from "./ports";

// Architecture "고객 주문 생성" ③. 가격 재계산·재고 차감·픽업 번호는 전부 DB 함수 create_order 안에서 한다.
// ① 멱등키 선조회(T-08)와 ② 속도 제한(T-51)은 각 Task에서 이 앞에 추가한다.
export async function createOrder(
  dto: CreateOrderRequest,
  deps: { orderRepository: Pick<OrderRepository, "createOrder"> },
): Promise<CreateOrderResponse> {
  return deps.orderRepository.createOrder(dto);
}
