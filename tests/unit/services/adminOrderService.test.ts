import { describe, expect, it, vi } from "vitest";
import {
    listAdminOrders,
    getAdminOrderById,
    acknowledgeAdminOrder,
} from "@/services/adminOrderService";
import type { AdminOrderRepository } from "@/services/ports";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";

function createMockOrder(id: string, acknowledgedAt: string | null = null): AdminOrderDto {
    return {
        id,
        pickupNumber: 101,
        status: "pending",
        paymentMethod: "cash",
        transferMethod: null,
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

describe("adminOrderService", () => {
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
