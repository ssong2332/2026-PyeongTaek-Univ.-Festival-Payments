import type { OrderForTransition, OrderRepository, TransitionCommand } from "@/services/ports";
import { AppError } from "@/lib/api/errors";

// transition_order 함수처럼 CAS(현재 상태 = from일 때만 갱신)를 흉내 낸다.
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
      const order = store.get(command.orderId);
      if (!order) throw new AppError("NOT_FOUND");
      if (order.status !== command.from) throw new AppError("STATE_CHANGED");
      order.status = command.to;
      return { ...order };
    },
  };

  return { repo, store, calls };
}
