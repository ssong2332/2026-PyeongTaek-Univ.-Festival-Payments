import { describe, expect, it } from "vitest";
import { reportTransfer } from "@/services/transferReportService";
import { AppError } from "@/lib/api/errors";
import type { Clock, OrderRepository, TransferReportResult } from "@/services/ports";

const TOKEN = "a".repeat(64);
const NOW = new Date("2026-10-07T03:00:00.000Z");
const clock: Clock = { now: () => NOW };

function fakeRepo(result: TransferReportResult) {
  const calls: { token: string; at: Date }[] = [];
  const orderRepository: Pick<OrderRepository, "reportTransfer"> = {
    async reportTransfer(token, at) {
      calls.push({ token, at });
      return result;
    },
  };
  return { orderRepository, calls };
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

describe("transferReportService.reportTransfer", () => {
  it("처음 신고하면 지금 시각으로 기록하고 그 시각을 돌려준다", async () => {
    const { orderRepository, calls } = fakeRepo({ outcome: "reported", transferReportedAt: NOW.toISOString() });
    expect(await reportTransfer(TOKEN, { orderRepository, clock })).toEqual({ transferReportedAt: NOW.toISOString() });
    expect(calls).toEqual([{ token: TOKEN, at: NOW }]);
  });

  it("이미 신고된 주문이면 처음 시각 그대로 돌려준다(연타 멱등)", async () => {
    const first = "2026-10-07T02:55:00.000Z";
    const { orderRepository } = fakeRepo({ outcome: "already_reported", transferReportedAt: first });
    expect(await reportTransfer(TOKEN, { orderRepository, clock })).toEqual({ transferReportedAt: first });
  });

  it("현금 주문·결제대기가 아닌 주문은 409 INVALID_TRANSITION", async () => {
    const { orderRepository } = fakeRepo({ outcome: "not_allowed" });
    await expectAppError(reportTransfer(TOKEN, { orderRepository, clock }), "INVALID_TRANSITION", 409);
  });

  it("없는 토큰은 404 NOT_FOUND", async () => {
    const { orderRepository } = fakeRepo({ outcome: "not_found" });
    await expectAppError(reportTransfer(TOKEN, { orderRepository, clock }), "NOT_FOUND", 404);
  });

  it.each(["", "abc", "A".repeat(64), `${"a".repeat(63)}g`, "a".repeat(65)])(
    "토큰 형식(64자 소문자 16진수)이 틀리면 DB를 부르지 않고 404: %j",
    async (token) => {
      const { orderRepository, calls } = fakeRepo({ outcome: "reported", transferReportedAt: NOW.toISOString() });
      await expectAppError(reportTransfer(token, { orderRepository, clock }), "NOT_FOUND", 404);
      expect(calls).toHaveLength(0);
    },
  );
});
