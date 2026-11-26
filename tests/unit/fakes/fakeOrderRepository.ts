import type { OrderForTransition, OrderRepository, TransitionCommand } from "@/services/ports";
import { AppError } from "@/lib/api/errors";
import { guardsCancelRequest } from "@/domain/order/stateMachine";

// transition_order 함수처럼 CAS(현재 상태 = from일 때만 갱신)를 흉내 낸다. expectedCancel이 있으면 0106 보호 함수처럼 취소 요청 값도 비교한다.
export function createFakeOrderRepository(orders: OrderForTransition[] = []) {
  const store = new Map(orders.map((order) => [order.id, { ...order }]));
  const calls: TransitionCommand[] = [];

  const repo: Pick<OrderRepository, "findById" | "transition"> = {
    async findById(id) {
      const order = store.get(id);
      return order ? { ...order } : null;
    },
    async transition(command) {
      calls.push(command);
      // 실제 저장소와 같게: 보호 대상인데 기대값이 빠지면 멈춘다.
      if (command.expectedCancel === undefined && guardsCancelRequest(command.action)) {
        throw new Error(`transition ${command.action} requires expectedCancel (T-54)`);
      }
      const order = store.get(command.orderId);
      if (!order) throw new AppError("NOT_FOUND", 404);
      if (order.status !== command.from) throw new AppError("STATE_CHANGED", 409);
      // 0106 보호 함수처럼 읽은 취소 요청 값이 그대로일 때만 바꾼다.
      if (command.expectedCancel
        && ((order.cancelRequestedAt ?? null) !== command.expectedCancel.requestedAt
          || (order.cancelRejectedAt ?? null) !== command.expectedCancel.rejectedAt)) {
        throw new AppError("STATE_CHANGED", 409);
      }
      order.status = command.to;
      return { ...order };
    },
  };

  return { repo, store, calls };
}
