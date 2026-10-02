import { describe, expect, it } from "vitest";
import { requestCancel } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { OrderByTokenResult } from "@/services/ports";
import { createFakeTokenOrderRepository, tokenOf } from "../fakes/fakeTokenOrderRepository";

const FIRST = "2026-10-07T02:55:00.000Z";
const NOW = "2026-10-07T03:00:00.000Z";

const paidOrder: OrderByTokenResult = {
  id: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  status: "paid",
  paymentMethod: "transfer",
  totalAmount: 6000,
  items: [],
  createdAt: "2026-10-07T02:50:00+00:00",
  transferReportedAt: null,
  cancelRequestedAt: null,
  cancelRejectedAt: null,
};
const TOKEN = tokenOf(paidOrder);

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

describe("orderService.requestCancel", () => {
  it.each(["pending", "paid"] as const)(
    "%s 주문은 setCancelRequested(주문 id)로 기록하고 그 시각을 돌려준다 — 상태는 그대로",
    async (status) => {
      const { repo, store, cancelRequestCalls } = createFakeTokenOrderRepository([{ ...paidOrder, status }], { now: NOW });
      expect(await requestCancel(TOKEN, { orderRepository: repo })).toEqual({ cancelRequestedAt: NOW });
      expect(cancelRequestCalls).toEqual([paidOrder.id]);
      expect(store.get(paidOrder.id)).toMatchObject({ status, cancelRequestedAt: NOW });
    },
  );

  it("이미 요청된 주문이면 기록하지 않고 처음 시각을 돌려준다(연타 멱등)", async () => {
    const { repo, cancelRequestCalls } = createFakeTokenOrderRepository([
      { ...paidOrder, cancelRequestedAt: "2026-10-07T02:55:00+00:00" },
    ]);
    expect(await requestCancel(TOKEN, { orderRepository: repo })).toEqual({ cancelRequestedAt: FIRST });
    expect(cancelRequestCalls).toHaveLength(0);
  });

  it("동시에 다른 요청이 먼저 기록했으면 다시 조회해 그 시각을 돌려준다", async () => {
    const { repo, store, calls } = createFakeTokenOrderRepository([paidOrder], {
      now: NOW,
      beforeSet: (order) => { order.cancelRequestedAt = FIRST; },
    });
    expect(await requestCancel(TOKEN, { orderRepository: repo })).toEqual({ cancelRequestedAt: FIRST });
    expect(calls.findByToken).toHaveLength(2);
    expect(store.get(paidOrder.id)?.cancelRequestedAt).toBe(FIRST);
  });

  it("기록 직전에 조리가 시작됐으면 409 CANCEL_REQUEST_NOT_ALLOWED", async () => {
    const { repo } = createFakeTokenOrderRepository([paidOrder], {
      beforeSet: (order) => { order.status = "cooking"; },
    });
    await expectAppError(requestCancel(TOKEN, { orderRepository: repo }), "CANCEL_REQUEST_NOT_ALLOWED", 409);
  });

  it.each(["cooking", "completed", "cancelled", "refunded", "expired"] as const)(
    "조리중 이후(%s) 주문은 409 CANCEL_REQUEST_NOT_ALLOWED, 기록하지 않는다",
    async (status) => {
      const { repo, store, cancelRequestCalls } = createFakeTokenOrderRepository([{ ...paidOrder, status }]);
      await expectAppError(requestCancel(TOKEN, { orderRepository: repo }), "CANCEL_REQUEST_NOT_ALLOWED", 409);
      expect(cancelRequestCalls).toHaveLength(0);
      expect(store.get(paidOrder.id)?.cancelRequestedAt).toBeNull();
    },
  );

  it("거절된 주문은 다시 요청할 수 없다 — 409 (DECISIONS #10)", async () => {
    const { repo, cancelRequestCalls } = createFakeTokenOrderRepository([
      { ...paidOrder, cancelRequestedAt: FIRST, cancelRejectedAt: NOW },
    ]);
    await expectAppError(requestCancel(TOKEN, { orderRepository: repo }), "CANCEL_REQUEST_NOT_ALLOWED", 409);
    expect(cancelRequestCalls).toHaveLength(0);
  });

  it("없는 토큰은 404 NOT_FOUND", async () => {
    const { repo } = createFakeTokenOrderRepository([]);
    await expectAppError(requestCancel(TOKEN, { orderRepository: repo }), "NOT_FOUND", 404);
  });

  it.each(["", "abc", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)])(
    "토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404: %j",
    async (token) => {
      const { repo, calls } = createFakeTokenOrderRepository([paidOrder]);
      await expectAppError(requestCancel(token, { orderRepository: repo }), "NOT_FOUND", 404);
      expect(calls.findByToken).toHaveLength(0);
    },
  );
});
