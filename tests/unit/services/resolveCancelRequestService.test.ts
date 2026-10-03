import { describe, expect, it } from "vitest";
import { resolveCancelRequest } from "@/services/adminOrderService";
import { AppError } from "@/lib/api/errors";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { createFakeCancelRequestRepositories } from "../fakes/fakeCancelRequestRepositories";

const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const REQUESTED = "2026-10-07T02:55:00.000Z";
const NOW = "2026-10-07T03:00:00.000Z";

// 취소 요청이 들어온 결제확인 주문
const requested: AdminOrderDto = {
  id: ORDER_ID,
  pickupNumber: 151,
  status: "paid",
  paymentMethod: "transfer",
  totalAmount: 6000,
  items: [],
  createdAt: "2026-10-07T02:50:00.000Z",
  updatedAt: "2026-10-07T02:55:00.000Z",
  acknowledgedAt: null,
  transferReportedAt: null,
  cancelRequestedAt: REQUESTED,
  cancelRejectedAt: null,
  paidAt: "2026-10-07T02:52:00.000Z",
  cookingStartedAt: null,
  completedAt: null,
  closedAt: null,
  refundChannel: null,
  lastReason: null,
  availableActions: ["start_cooking", "cancel"],
};

function setup(order: AdminOrderDto | null = requested, options: Parameters<typeof createFakeCancelRequestRepositories>[1] = {}) {
  return createFakeCancelRequestRepositories(order ? [order] : [], { now: NOW, ...options });
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

describe("adminOrderService.resolveCancelRequest — 승인", () => {
  it.each(["pending", "paid"] as const)("%s 주문 승인은 transition(cancel, 사유)로 처리한다", async (status) => {
    const { adminOrderRepository, orderRepository, transitions, rejections } = setup({ ...requested, status });
    const result = await resolveCancelRequest(
      { orderId: ORDER_ID, decision: "approve", reason: "  고객 요청  ", adminId: ADMIN_ID },
      { adminOrderRepository, orderRepository },
    );
    expect(result).toMatchObject({ id: ORDER_ID, status: "cancelled" });
    expect(transitions).toEqual([{
      orderId: ORDER_ID, from: status, to: "cancelled", action: "cancel",
      actorType: "admin", actorId: ADMIN_ID, reason: "고객 요청", refundChannel: null,
    }]);
    expect(rejections).toHaveLength(0);
  });
});

describe("adminOrderService.resolveCancelRequest — 거절", () => {
  it("rejectCancelRequest(주문 id, 관리자 id, 사유)로 기록하고 상태는 그대로 둔다", async () => {
    const { adminOrderRepository, orderRepository, transitions, rejections } = setup();
    const result = await resolveCancelRequest(
      { orderId: ORDER_ID, decision: "reject", reason: "  이미 조리 준비 중  ", adminId: ADMIN_ID },
      { adminOrderRepository, orderRepository },
    );
    expect(result).toMatchObject({ id: ORDER_ID, status: "paid", cancelRequestedAt: REQUESTED, cancelRejectedAt: NOW });
    expect(rejections).toEqual([{ id: ORDER_ID, actorId: ADMIN_ID, reason: "이미 조리 준비 중" }]);
    expect(transitions).toHaveLength(0);
  });

  it("조회 뒤에 다른 관리자가 먼저 처리했으면(조건부 갱신 0행) 409 INVALID_TRANSITION", async () => {
    const { adminOrderRepository, orderRepository } = setup(requested, {
      beforeReject: (order) => { order.cancelRejectedAt = "2026-10-07T02:59:00.000Z"; },
    });
    await expectAppError(
      resolveCancelRequest(
        { orderId: ORDER_ID, decision: "reject", reason: "사유", adminId: ADMIN_ID },
        { adminOrderRepository, orderRepository },
      ),
      "INVALID_TRANSITION", 409,
    );
  });
});

describe("adminOrderService.resolveCancelRequest — 거부", () => {
  it.each(["approve", "reject"] as const)("취소 요청이 없는 주문은 %s 409 INVALID_TRANSITION", async (decision) => {
    const { adminOrderRepository, orderRepository, transitions, rejections } = setup({ ...requested, cancelRequestedAt: null });
    await expectAppError(
      resolveCancelRequest({ orderId: ORDER_ID, decision, reason: "사유", adminId: ADMIN_ID }, { adminOrderRepository, orderRepository }),
      "INVALID_TRANSITION", 409,
    );
    expect(transitions).toHaveLength(0);
    expect(rejections).toHaveLength(0);
  });

  it.each(["approve", "reject"] as const)("이미 거절된 요청은 %s 409 INVALID_TRANSITION", async (decision) => {
    const { adminOrderRepository, orderRepository, transitions, rejections } = setup({ ...requested, cancelRejectedAt: NOW });
    await expectAppError(
      resolveCancelRequest({ orderId: ORDER_ID, decision, reason: "사유", adminId: ADMIN_ID }, { adminOrderRepository, orderRepository }),
      "INVALID_TRANSITION", 409,
    );
    expect(transitions).toHaveLength(0);
    expect(rejections).toHaveLength(0);
  });

  it.each(["cooking", "completed", "cancelled"] as const)(
    "결제대기·결제확인이 아닌(%s) 주문은 409 INVALID_TRANSITION",
    async (status) => {
      const { adminOrderRepository, orderRepository } = setup({ ...requested, status });
      for (const decision of ["approve", "reject"] as const) {
        await expectAppError(
          resolveCancelRequest({ orderId: ORDER_ID, decision, reason: "사유", adminId: ADMIN_ID }, { adminOrderRepository, orderRepository }),
          "INVALID_TRANSITION", 409,
        );
      }
    },
  );

  it.each(["approve", "reject"] as const)("사유가 공백뿐이면 %s 400 REASON_REQUIRED, 아무것도 바꾸지 않는다", async (decision) => {
    const { adminOrderRepository, orderRepository, store, transitions, rejections } = setup();
    await expectAppError(
      resolveCancelRequest({ orderId: ORDER_ID, decision, reason: "   ", adminId: ADMIN_ID }, { adminOrderRepository, orderRepository }),
      "REASON_REQUIRED", 400,
    );
    expect(transitions).toHaveLength(0);
    expect(rejections).toHaveLength(0);
    expect(store.get(ORDER_ID)).toMatchObject({ status: "paid", cancelRejectedAt: null });
  });

  it("없는 주문은 404 NOT_FOUND", async () => {
    const { adminOrderRepository, orderRepository } = setup(null);
    await expectAppError(
      resolveCancelRequest({ orderId: ORDER_ID, decision: "reject", reason: "사유", adminId: ADMIN_ID }, { adminOrderRepository, orderRepository }),
      "NOT_FOUND", 404,
    );
  });
});
