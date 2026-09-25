import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/repositories/adminOrderRepository");
vi.mock("@/infra/supabase/session");

import { NextRequest } from "next/server";
import { GET as getOrders } from "@/app/api/admin/orders/route";
import { GET as getOrderById } from "@/app/api/admin/orders/[id]/route";
import { POST as postAcknowledge } from "@/app/api/admin/orders/[id]/acknowledge/route";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { requireAdmin } from "@/infra/supabase/session";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";
import type { User } from "@supabase/supabase-js";

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

describe("Admin Orders Route Handlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({
            id: "admin-user-id",
            email: "admin@test.com",
        } as unknown as User);
    });

    describe("GET /api/admin/orders", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest("http://localhost:3000/api/admin/orders");
            const res = await getOrders(req);

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("인증된 관리자에게 주문 목록과 미확인 주문 수를 200 JSON으로 반환한다", async () => {
            const mockOrders = [
                createMockOrder("1", null),
                createMockOrder("2", "2026-09-25T10:01:00Z"),
            ];

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn().mockResolvedValue(mockOrders),
                    findById: vi.fn(),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest("http://localhost:3000/api/admin/orders?status=pending&pickupNumber=101");
            const res = await getOrders(req);

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.orders.length).toBe(2);
            expect(data.unacknowledgedCount).toBe(1);
        });
    });

    describe("GET /api/admin/orders/[id]", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-123");
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: "order-123" }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("존재하는 주문의 단건 조회가 성공하면 200 JSON을 반환한다", async () => {
            const mockOrder = createMockOrder("order-123", null);

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(mockOrder),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-123");
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: "order-123" }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe("order-123");
        });

        it("주문이 없으면 404 NOT_FOUND 에러를 반환한다", async () => {
            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(null),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest("http://localhost:3000/api/admin/orders/not-found");
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: "not-found" }),
            });

            expect(res.status).toBe(404);
            const data = await res.json();
            expect(data.error.code).toBe("NOT_FOUND");
        });
    });

    describe("POST /api/admin/orders/[id]/acknowledge", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-123/acknowledge", {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: "order-123" }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("주문 확인이 성공하면 200 JSON과 갱신된 주문을 반환한다", async () => {
            const unacked = createMockOrder("order-123", null);
            const acked = createMockOrder("order-123", "2026-09-25T10:05:00Z");

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(unacked),
                    acknowledge: vi.fn().mockResolvedValue(acked),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-123/acknowledge", {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: "order-123" }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.acknowledgedAt).toBe("2026-09-25T10:05:00Z");
        });
    });
});
