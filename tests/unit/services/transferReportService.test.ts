import { describe, expect, it } from "vitest";
import { reportTransfer } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { OrderByTokenResult } from "@/services/ports";
import { createFakeTokenOrderRepository, tokenOf } from "../fakes/fakeTokenOrderRepository";

const FIRST = "2026-10-07T02:55:00.000Z";
const NOW = "2026-10-07T03:00:00.000Z";

const pendingTransfer: OrderByTokenResult = {
  id: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 151,
  status: "pending",
  paymentMethod: "transfer",
  totalAmount: 6000,
  items: [],
  createdAt: "2026-10-07T02:50:00+00:00",
  transferReportedAt: null,
  cancelRequestedAt: null,
  cancelRejectedAt: null,
};
const TOKEN = tokenOf(pendingTransfer);

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

describe("orderService.reportTransfer", () => {
  it("처음 신고하면 setTransferReported(주문 id)로 기록하고 그 시각을 돌려준다", async () => {
    const { repo, store, calls } = createFakeTokenOrderRepository([pendingTransfer], { now: NOW });
    expect(await reportTransfer(TOKEN, { orderRepository: repo })).toEqual({ transferReportedAt: NOW });
    expect(calls).toEqual({ findByToken: [TOKEN], setTransferReported: [pendingTransfer.id] });
    expect(store.get(pendingTransfer.id)).toMatchObject({ status: "pending", transferReportedAt: NOW });
  });

  it("이미 신고된 주문이면 기록하지 않고 처음 시각을 돌려준다(연타 멱등)", async () => {
    const { repo, calls } = createFakeTokenOrderRepository([
      { ...pendingTransfer, transferReportedAt: "2026-10-07T02:55:00+00:00" },
    ]);
    expect(await reportTransfer(TOKEN, { orderRepository: repo })).toEqual({ transferReportedAt: FIRST });
    expect(calls.setTransferReported).toHaveLength(0);
  });

  it("동시에 다른 요청이 먼저 기록했으면 다시 조회해 그 시각을 돌려준다", async () => {
    const { repo, store, calls } = createFakeTokenOrderRepository([pendingTransfer], {
      now: NOW,
      beforeSet: (order) => { order.transferReportedAt = FIRST; },
    });
    expect(await reportTransfer(TOKEN, { orderRepository: repo })).toEqual({ transferReportedAt: FIRST });
    expect(calls.findByToken).toHaveLength(2);
    expect(store.get(pendingTransfer.id)?.transferReportedAt).toBe(FIRST);
  });

  it("기록 직전에 결제대기가 아니게 됐으면(입금 확인·만료) 409 INVALID_TRANSITION", async () => {
    const { repo } = createFakeTokenOrderRepository([pendingTransfer], {
      beforeSet: (order) => { order.status = "expired"; },
    });
    await expectAppError(reportTransfer(TOKEN, { orderRepository: repo }), "INVALID_TRANSITION", 409);
  });

  it("현금 주문은 409 INVALID_TRANSITION, 기록하지 않는다", async () => {
    const { repo, calls } = createFakeTokenOrderRepository([{ ...pendingTransfer, paymentMethod: "cash" }]);
    await expectAppError(reportTransfer(TOKEN, { orderRepository: repo }), "INVALID_TRANSITION", 409);
    expect(calls.setTransferReported).toHaveLength(0);
  });

  it.each(["paid", "cooking", "completed", "cancelled", "refunded", "expired"] as const)(
    "결제대기가 아닌(%s) 주문은 이미 신고됐어도 409",
    async (status) => {
      const { repo, calls } = createFakeTokenOrderRepository([{ ...pendingTransfer, status, transferReportedAt: FIRST }]);
      await expectAppError(reportTransfer(TOKEN, { orderRepository: repo }), "INVALID_TRANSITION", 409);
      expect(calls.setTransferReported).toHaveLength(0);
    },
  );

  it("없는 토큰은 404 NOT_FOUND", async () => {
    const { repo } = createFakeTokenOrderRepository([]);
    await expectAppError(reportTransfer(TOKEN, { orderRepository: repo }), "NOT_FOUND", 404);
  });

  it.each(["", "abc", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)])(
    "토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404: %j",
    async (token) => {
      const { repo, calls } = createFakeTokenOrderRepository([pendingTransfer]);
      await expectAppError(reportTransfer(token, { orderRepository: repo }), "NOT_FOUND", 404);
      expect(calls.findByToken).toHaveLength(0);
    },
  );
});
