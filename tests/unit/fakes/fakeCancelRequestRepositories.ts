import { AppError } from "@/lib/api/errors";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { AdminOrderRepository, OrderRepository, TransitionCommand } from "@/services/ports";

type Options = {
  // 거절 시각(rejectCancelRequest(id, actorId, reason)는 시각을 받지 않는다).
  now?: string;
  // 조건 확인 직전에 끼어드는 다른 요청(다른 관리자의 거절·취소, 조리 시작)을 흉내 낸다.
  beforeReject?: (order: AdminOrderDto) => void;
};

const REJECTABLE = ["pending", "paid"];

// 고객 취소 요청의 승인·거절(T-35)에 쓰는 관리자 조회·상태 전환·거절 기록의 in-memory 구현.
// 두 저장소가 같은 주문 저장소를 본다. transition은 DB 함수처럼 CAS로, rejectCancelRequest는 조건부 갱신으로 흉내 낸다.
export function createFakeCancelRequestRepositories(orders: AdminOrderDto[] = [], options: Options = {}) {
  const store = new Map(orders.map((order) => [order.id, { ...order }]));
  const transitions: TransitionCommand[] = [];
  const rejections: { id: string; actorId: string; reason: string }[] = [];
  const now = options.now ?? "2026-10-07T03:00:00.000Z";

  const adminOrderRepository: Pick<AdminOrderRepository, "findById"> = {
    async findById(id) {
      const order = store.get(id);
      return order ? { ...order } : null;
    },
  };

  const orderRepository: Pick<OrderRepository, "findById" | "transition" | "rejectCancelRequest"> = {
    async findById(id) {
      const order = store.get(id);
      return order ? { id: order.id, status: order.status, paymentMethod: order.paymentMethod } : null;
    },
    async transition(command) {
      transitions.push(command);
      const order = store.get(command.orderId);
      if (!order) throw new AppError("NOT_FOUND", 404);
      if (order.status !== command.from) throw new AppError("STATE_CHANGED", 409);
      order.status = command.to;
      order.lastReason = command.reason;
      return { id: order.id, status: order.status, paymentMethod: order.paymentMethod };
    },
    async rejectCancelRequest(id, actorId, reason) {
      const order = store.get(id);
      if (!order) return false;
      options.beforeReject?.(order);
      if (!REJECTABLE.includes(order.status) || !order.cancelRequestedAt || order.cancelRejectedAt) return false;
      order.cancelRejectedAt = now;
      order.lastReason = reason;
      rejections.push({ id, actorId, reason });
      return true;
    },
  };

  return { adminOrderRepository, orderRepository, store, transitions, rejections };
}
