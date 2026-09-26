import { describe, expect, it, vi } from "vitest";
import {
    listAdminOrders,
    getAdminOrderById,
    acknowledgeAdminOrder,
    transition,
} from "@/services/adminOrderService";
import type { AdminOrderRepository, OrderForTransition, OrderRepository } from "@/services/ports";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";
import { createFakeOrderRepository } from "../fakes/fakeOrderRepository";

function createMockOrder(id: string, acknowledgedAt: string | null = null): AdminOrderDto {
    return {
        id,
        pickupNumber: 101,
        status: "pending",
        paymentMethod: "cash",
        totalAmount: 10000,
        items: [],
        createdAt: "2026-09-25T10:00:00Z",
        updatedAt: "2026-09-25T10:00:00Z",
        acknowledgedAt,
        transferReportedAt: null,
        cancelRequestedAt: null,
        cancelRejectedAt: null,
        paidAt: null,
        cookingStartedAt: null,
        completedAt: null,
        closedAt: null,
        refundChannel: null,
        lastReason: null,
        availableActions: ["confirm_cash", "cancel"],
    };
}

describe("adminOrderService (list, getById, acknowledge)", () => {
    it("listAdminOrders는 전체 주문 목록과 미확인 주문 수를 올바르게 반환한다", async () => {
        const repo: AdminOrderRepository = {
            list: vi.fn().mockResolvedValue([
                createMockOrder("1", null),
                createMockOrder("2", null),
                createMockOrder("3", "2026-09-25T10:01:00Z"),
            ]),
            findById: vi.fn(),
            acknowledge: vi.fn(),
        };

        const result = await listAdminOrders(repo);

        expect(result.orders.length).toBe(3);
        expect(result.unacknowledgedCount).toBe(2);
    });

    it("getAdminOrderById는 주문이 없으면 404 NOT_FOUND를 던진다", async () => {
        const repo: AdminOrderRepository = {
            list: vi.fn(),
            findById: vi.fn().mockResolvedValue(null),
            acknowledge: vi.fn(),
        };

        await expect(getAdminOrderById(repo, "non-existent")).rejects.toThrow(AppError);
    });

    it("acknowledgeAdminOrder는 미확인 주문에 대해 acknowledge를 호출하고 확인 상태로 갱신한다", async () => {
        const unacked = createMockOrder("1", null);
        const acked = createMockOrder("1", "2026-09-25T10:05:00Z");

        const repo: AdminOrderRepository = {
            list: vi.fn(),
            findById: vi.fn().mockResolvedValue(unacked),
            acknowledge: vi.fn().mockResolvedValue(acked),
        };

        const result = await acknowledgeAdminOrder(repo, "1", "admin-user");

        expect(repo.acknowledge).toHaveBeenCalledWith("1", "admin-user");
        expect(result.acknowledgedAt).toBe("2026-09-25T10:05:00Z");
    });

    it("acknowledgeAdminOrder는 이미 확인된 주문이면 중복 DB 호출 없이 기존 주문을 그대로 반환한다 (멱등)", async () => {
        const alreadyAcked = createMockOrder("1", "2026-09-25T10:05:00Z");

        const repo: AdminOrderRepository = {
            list: vi.fn(),
            findById: vi.fn().mockResolvedValue(alreadyAcked),
            acknowledge: vi.fn(),
        };

        const result = await acknowledgeAdminOrder(repo, "1");

        expect(repo.acknowledge).not.toHaveBeenCalled();
        expect(result).toBe(alreadyAcked);
    });
});

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";

function setup(order: Partial<OrderForTransition> = {}) {
    return createFakeOrderRepository([{ id: ORDER_ID, status: "pending", paymentMethod: "transfer", ...order }]);
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code, status });
}

describe("adminOrderService.transition", () => {
    it("허용 전환이면 repo.transition에 from·to·주체를 넘기고 갱신본을 돌려준다", async () => {
        const { repo, calls } = setup();
        const result = await transition({ orderId: ORDER_ID, action: "confirm_payment", adminId: ADMIN_ID }, { orderRepository: repo });

        expect(result).toEqual({ id: ORDER_ID, status: "paid", paymentMethod: "transfer" });
        expect(calls).toEqual([{
            orderId: ORDER_ID, from: "pending", to: "paid", action: "confirm_payment",
            actorType: "admin", actorId: ADMIN_ID, reason: null, refundChannel: null,
        }]);
    });

    it("현금 주문은 confirm_cash 1회로 조리중이 된다", async () => {
        const { repo } = setup({ paymentMethod: "cash" });
        const result = await transition({ orderId: ORDER_ID, action: "confirm_cash", adminId: ADMIN_ID }, { orderRepository: repo });
        expect(result.status).toBe("cooking");
    });

    it("주문이 없으면 404 NOT_FOUND, repo.transition은 호출하지 않는다", async () => {
        const { repo, calls } = createFakeOrderRepository();
        await expectAppError(transition({ orderId: ORDER_ID, action: "confirm_payment", adminId: ADMIN_ID }, { orderRepository: repo }), "NOT_FOUND", 404);
        expect(calls).toHaveLength(0);
    });

    it("상태 머신이 불허하면 409 INVALID_TRANSITION (완료 → 취소)", async () => {
        const { repo, calls } = setup({ status: "completed" });
        await expectAppError(transition({ orderId: ORDER_ID, action: "cancel", adminId: ADMIN_ID, reason: "고객 요청" }, { orderRepository: repo }), "INVALID_TRANSITION", 409);
        expect(calls).toHaveLength(0);
    });

    it.each(["expire", "auto_complete"] as const)("관리자는 시스템 전용 %s를 쓸 수 없다 → 409 INVALID_TRANSITION", async (action) => {
        const { repo, calls } = setup({ status: action === "expire" ? "pending" : "cooking" });
        await expectAppError(transition({ orderId: ORDER_ID, action, adminId: ADMIN_ID }, { orderRepository: repo }), "INVALID_TRANSITION", 409);
        expect(calls).toHaveLength(0);
    });

    it.each([undefined, "", "   "])("취소 사유가 %j이면 400 REASON_REQUIRED", async (reason) => {
        const { repo, calls } = setup();
        await expectAppError(transition({ orderId: ORDER_ID, action: "cancel", adminId: ADMIN_ID, reason }, { orderRepository: repo }), "REASON_REQUIRED", 400);
        expect(calls).toHaveLength(0);
    });

    it("환불 채널이 없으면 400 REFUND_CHANNEL_REQUIRED", async () => {
        const { repo } = setup({ status: "cooking" });
        await expectAppError(transition({ orderId: ORDER_ID, action: "refund", adminId: ADMIN_ID, reason: "재료 소진" }, { orderRepository: repo }), "REFUND_CHANNEL_REQUIRED", 400);
    });

    it("환불은 사유(앞뒤 공백 제거)와 채널을 repo에 넘긴다", async () => {
        const { repo, calls } = setup({ status: "cooking" });
        const result = await transition(
            { orderId: ORDER_ID, action: "refund", adminId: ADMIN_ID, reason: "  재료 소진 ", refundChannel: "bank" },
            { orderRepository: repo },
        );
        expect(result.status).toBe("refunded");
        expect(calls[0]).toMatchObject({ reason: "재료 소진", refundChannel: "bank" });
    });

    it("사유가 필요 없는 전환에 온 사유·환불 채널은 저장하지 않는다", async () => {
        const { repo, calls } = setup({ status: "paid" });
        await transition(
            { orderId: ORDER_ID, action: "start_cooking", adminId: ADMIN_ID, reason: "무시", refundChannel: "bank" },
            { orderRepository: repo },
        );
        expect(calls[0]).toMatchObject({ reason: null, refundChannel: null });
    });

    it("취소는 사유를 저장하지만 환불 채널은 저장하지 않는다", async () => {
        const { repo, calls } = setup({ status: "paid" });
        await transition(
            { orderId: ORDER_ID, action: "cancel", adminId: ADMIN_ID, reason: "고객 요청", refundChannel: "bank" },
            { orderRepository: repo },
        );
        expect(calls[0]).toMatchObject({ to: "cancelled", reason: "고객 요청", refundChannel: null });
    });

    it("읽은 뒤 다른 관리자가 먼저 바꾸면 repo의 409 STATE_CHANGED를 그대로 전달한다", async () => {
        const { repo, store } = setup();
        const racingRepo: OrderRepository = {
            findById: repo.findById,
            async transition(command) {
                store.get(ORDER_ID)!.status = "cancelled";
                return repo.transition(command);
            },
        };
        await expectAppError(transition({ orderId: ORDER_ID, action: "confirm_payment", adminId: ADMIN_ID }, { orderRepository: racingRepo }), "STATE_CHANGED", 409);
    });
});
