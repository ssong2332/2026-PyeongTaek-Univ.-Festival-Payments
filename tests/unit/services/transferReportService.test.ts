import { describe, expect, it } from "vitest";
import { reportTransfer } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { OrderByTokenResult, OrderRepository } from "@/services/ports";

const TOKEN = "a".repeat(64);
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

// findByToken은 부를 때마다 다음 값을 돌려준다(동시 요청으로 두 번째 조회 결과가 달라지는 경우 재현).
function fakeRepo(found: (OrderByTokenResult | null)[], recorded: string | null = NOW) {
  const calls = { findByToken: [] as string[], setTransferReported: [] as string[] };
  const orderRepository: Pick<OrderRepository, "findByToken" | "setTransferReported"> = {
    async findByToken(token) {
      calls.findByToken.push(token);
      return found.length > 1 ? found.shift()! : found[0];
    },
    async setTransferReported(id) {
      calls.setTransferReported.push(id);
      return recorded;
    },
  };
  return { orderRepository, calls };
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

describe("orderService.reportTransfer", () => {
  it("처음 신고하면 setTransferReported(주문 id)로 기록하고 그 시각을 돌려준다", async () => {
    const { orderRepository, calls } = fakeRepo([pendingTransfer]);
    expect(await reportTransfer(TOKEN, { orderRepository })).toEqual({ transferReportedAt: NOW });
    expect(calls).toEqual({ findByToken: [TOKEN], setTransferReported: [pendingTransfer.id] });
  });

  it("이미 신고된 주문이면 기록하지 않고 처음 시각을 돌려준다(연타 멱등)", async () => {
    const { orderRepository, calls } = fakeRepo([{ ...pendingTransfer, transferReportedAt: "2026-10-07T02:55:00+00:00" }]);
    expect(await reportTransfer(TOKEN, { orderRepository })).toEqual({ transferReportedAt: FIRST });
    expect(calls.setTransferReported).toHaveLength(0);
  });

  it("동시에 다른 요청이 먼저 기록했으면 다시 조회해 그 시각을 돌려준다", async () => {
    const { orderRepository, calls } = fakeRepo(
      [pendingTransfer, { ...pendingTransfer, transferReportedAt: FIRST }],
      null,
    );
    expect(await reportTransfer(TOKEN, { orderRepository })).toEqual({ transferReportedAt: FIRST });
    expect(calls.findByToken).toHaveLength(2);
  });

  it("기록 직전에 결제대기가 아니게 됐으면(입금 확인·만료) 409 INVALID_TRANSITION", async () => {
    const { orderRepository } = fakeRepo([pendingTransfer, { ...pendingTransfer, status: "expired" }], null);
    await expectAppError(reportTransfer(TOKEN, { orderRepository }), "INVALID_TRANSITION", 409);
  });

  it("현금 주문은 409 INVALID_TRANSITION, 기록하지 않는다", async () => {
    const { orderRepository, calls } = fakeRepo([{ ...pendingTransfer, paymentMethod: "cash" }]);
    await expectAppError(reportTransfer(TOKEN, { orderRepository }), "INVALID_TRANSITION", 409);
    expect(calls.setTransferReported).toHaveLength(0);
  });

  it.each(["paid", "cooking", "completed", "cancelled", "refunded", "expired"] as const)(
    "결제대기가 아닌(%s) 주문은 이미 신고됐어도 409",
    async (status) => {
      const { orderRepository, calls } = fakeRepo([{ ...pendingTransfer, status, transferReportedAt: FIRST }]);
      await expectAppError(reportTransfer(TOKEN, { orderRepository }), "INVALID_TRANSITION", 409);
      expect(calls.setTransferReported).toHaveLength(0);
    },
  );

  it("없는 토큰은 404 NOT_FOUND", async () => {
    const { orderRepository } = fakeRepo([null]);
    await expectAppError(reportTransfer(TOKEN, { orderRepository }), "NOT_FOUND", 404);
  });

  it.each(["", "abc", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)])(
    "토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404: %j",
    async (token) => {
      const { orderRepository, calls } = fakeRepo([pendingTransfer]);
      await expectAppError(reportTransfer(token, { orderRepository }), "NOT_FOUND", 404);
      expect(calls.findByToken).toHaveLength(0);
    },
  );
});
