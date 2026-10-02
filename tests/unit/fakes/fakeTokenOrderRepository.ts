import type { OrderByTokenResult, OrderRepository } from "@/services/ports";

type Options = {
  // 기록 시각(고정 시각 Clock 대신 — setTransferReported(id)는 시각을 받지 않는다).
  now?: string;
  // 조건 확인 직전에 끼어드는 다른 요청(동시 신고·입금 확인·만료)을 흉내 낸다.
  beforeSet?: (order: OrderByTokenResult) => void;
};

const CANCEL_REQUESTABLE = ["pending", "paid"];

// 상태 토큰으로 찾는 고객 주문(T-11 findByToken)과 송금 신고(T-32)·취소 요청(T-35) 기록의 in-memory 구현.
// setTransferReported는 DB처럼 결제대기·계좌이체·미신고일 때만 기록한다(조건부 갱신).
// setCancelRequested는 결제대기·결제확인이고 요청·거절 기록이 없을 때만 기록한다.
export function createFakeTokenOrderRepository(orders: OrderByTokenResult[] = [], options: Options = {}) {
  const store = new Map(orders.map((order) => [order.id, { ...order }]));
  const calls = { findByToken: [] as string[], setTransferReported: [] as string[] };
  const cancelRequestCalls: string[] = [];
  const now = options.now ?? "2026-10-07T03:00:00.000Z";

  const repo: Pick<OrderRepository, "findByToken" | "setTransferReported" | "setCancelRequested"> = {
    async findByToken(token) {
      calls.findByToken.push(token);
      const order = [...store.values()].find((o) => tokenOf(o) === token);
      return order ? { ...order } : null;
    },
    async setTransferReported(id) {
      calls.setTransferReported.push(id);
      const order = store.get(id);
      if (!order) return null;
      options.beforeSet?.(order);
      if (order.status !== "pending" || order.paymentMethod !== "transfer" || order.transferReportedAt) return null;
      order.transferReportedAt = now;
      return now;
    },
    async setCancelRequested(id) {
      cancelRequestCalls.push(id);
      const order = store.get(id);
      if (!order) return null;
      options.beforeSet?.(order);
      if (!CANCEL_REQUESTABLE.includes(order.status) || order.cancelRequestedAt || order.cancelRejectedAt) return null;
      order.cancelRequestedAt = now;
      return now;
    },
  };

  return { repo, store, calls, cancelRequestCalls };
}

// 토큰은 OrderByTokenResult에 없으므로 테스트에서는 주문 id로 만든 64자 토큰을 쓴다.
export function tokenOf(order: { id: string }): string {
  return order.id.replace(/-/g, "").padEnd(64, "0");
}
