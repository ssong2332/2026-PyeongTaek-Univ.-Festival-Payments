import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/supabaseOrderRepository", () => ({
    createSupabaseOrderRepository: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/adminOrderRepository", () => ({
    SupabaseAdminOrderRepository: vi.fn().mockImplementation(function () {
        return {};
    }),
}));
vi.mock("@/services/adminOrderService");

import { NextRequest } from "next/server";
import { POST as postTransition } from "@/app/api/admin/orders/[id]/transition/route";
import { requireAdmin } from "@/infra/supabase/session";
import { transition, getAdminOrderById } from "@/services/adminOrderService";
import { AppError } from "@/lib/api/errors";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { User } from "@supabase/supabase-js";

function createMockAdminOrder(
    id: string,
    status: AdminOrderDto["status"] = "cooking",
    action: AdminOrderDto["availableActions"][number] = "complete",
): AdminOrderDto {
    return {
        id,
        pickupNumber: 101,
        status,
        paymentMethod: "cash",
        totalAmount: 10000,
        items: [],
        createdAt: "2026-09-25T10:00:00Z",
        updatedAt: "2026-09-25T10:05:00Z",
        acknowledgedAt: "2026-09-25T10:01:00Z",
        transferReportedAt: null,
        cancelRequestedAt: null,
        cancelRejectedAt: null,
        paidAt: null,
        cookingStartedAt: "2026-09-25T10:05:00Z",
        completedAt: null,
        closedAt: null,
        refundChannel: null,
        lastReason: null,
        availableActions: [action],
    };
}

describe("POST /api/admin/orders/[id]/transition", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({
            id: "admin-user-123",
            email: "admin@test.com",
        } as unknown as User);
    });

    describe("인증 및 요청 파싱 검증", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 반환한다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "confirm_cash" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("본문이 비어있거나 잘못된 JSON 형식이면 400 VALIDATION_ERROR를 반환한다", async () => {
            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: "invalid-json",
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("VALIDATION_ERROR");
        });

        it("action 필드가 누락되었거나 유효하지 않으면 400 VALIDATION_ERROR를 반환한다", async () => {
            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ reason: "some reason" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("VALIDATION_ERROR");
        });

        // 시스템 전용 action은 상태 머신에는 있지만 관리자 API 계약에는 없으므로
        // 서비스(→ 409 INVALID_TRANSITION)까지 가지 않고 요청 검증에서 400으로 거부돼야 한다.
        it.each(["auto_complete", "expire"])(
            "시스템 전용 action(%s)은 400 VALIDATION_ERROR를 반환하고 서비스를 호출하지 않는다",
            async (action) => {
                const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                    method: "POST",
                    body: JSON.stringify({ action }),
                });
                const res = await postTransition(req, {
                    params: Promise.resolve({ id: "order-1" }),
                });

                expect(res.status).toBe(400);
                const data = await res.json();
                expect(data.error.code).toBe("VALIDATION_ERROR");
                expect(transition).not.toHaveBeenCalled();
            },
        );
    });

    describe("성공 시나리오 (200 OK)", () => {
        it("현금 확인(confirm_cash) 성공 시 200과 갱신된 주문 DTO를 반환한다", async () => {
            const updatedOrder = createMockAdminOrder("order-1", "cooking", "complete");
            vi.mocked(transition).mockResolvedValueOnce({
                id: "order-1",
                status: "cooking",
                paymentMethod: "cash",
            });
            vi.mocked(getAdminOrderById).mockResolvedValueOnce(updatedOrder);

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "confirm_cash" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe("order-1");
            expect(data.status).toBe("cooking");

            expect(transition).toHaveBeenCalledWith(
                {
                    orderId: "order-1",
                    action: "confirm_cash",
                    adminId: "admin-user-123",
                    reason: undefined,
                    refundChannel: undefined,
                },
                expect.any(Object),
            );
        });

        it("취소(cancel) 시 사유(reason)를 함께 전달하여 200과 갱신된 주문을 반환한다", async () => {
            const cancelledOrder = createMockAdminOrder("order-2", "cancelled", "cancel");
            cancelledOrder.lastReason = "고객 단순 변심";
            vi.mocked(transition).mockResolvedValueOnce({
                id: "order-2",
                status: "cancelled",
                paymentMethod: "cash",
            });
            vi.mocked(getAdminOrderById).mockResolvedValueOnce(cancelledOrder);

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-2/transition", {
                method: "POST",
                body: JSON.stringify({ action: "cancel", reason: "고객 단순 변심" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-2" }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe("cancelled");
            expect(data.lastReason).toBe("고객 단순 변심");

            expect(transition).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderId: "order-2",
                    action: "cancel",
                    adminId: "admin-user-123",
                    reason: "고객 단순 변심",
                }),
                expect.any(Object),
            );
        });

        it("환불(refund) 시 사유와 refundChannel을 전달하여 200을 반환한다", async () => {
            const refundedOrder = createMockAdminOrder("order-3", "refunded", "refund");
            refundedOrder.refundChannel = "cash";
            refundedOrder.lastReason = "품절 취소";
            vi.mocked(transition).mockResolvedValueOnce({
                id: "order-3",
                status: "refunded",
                paymentMethod: "cash",
            });
            vi.mocked(getAdminOrderById).mockResolvedValueOnce(refundedOrder);

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-3/transition", {
                method: "POST",
                body: JSON.stringify({
                    action: "refund",
                    reason: "품절 취소",
                    refundChannel: "cash",
                }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-3" }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.status).toBe("refunded");
            expect(data.refundChannel).toBe("cash");
        });
    });

    describe("비즈니스 에러 전파 검증", () => {
        it("주문이 없으면 서비스의 404 NOT_FOUND 에러를 반환한다", async () => {
            vi.mocked(transition).mockRejectedValueOnce(new AppError("NOT_FOUND", 404));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-404/transition", {
                method: "POST",
                body: JSON.stringify({ action: "confirm_cash" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-404" }),
            });

            expect(res.status).toBe(404);
            const data = await res.json();
            expect(data.error.code).toBe("NOT_FOUND");
        });

        it("불허된 상태 전환 시 서비스의 409 INVALID_TRANSITION 에러를 반환한다", async () => {
            vi.mocked(transition).mockRejectedValueOnce(new AppError("INVALID_TRANSITION", 409));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "complete" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.error.code).toBe("INVALID_TRANSITION");
        });

        it("취소 사유가 누락된 경우 400 REASON_REQUIRED 에러를 반환한다", async () => {
            vi.mocked(transition).mockRejectedValueOnce(new AppError("REASON_REQUIRED", 400));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "cancel" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("REASON_REQUIRED");
        });

        it("환불 채널이 누락된 경우 400 REFUND_CHANNEL_REQUIRED 에러를 반환한다", async () => {
            vi.mocked(transition).mockRejectedValueOnce(new AppError("REFUND_CHANNEL_REQUIRED", 400));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "refund", reason: "재료 소진" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("REFUND_CHANNEL_REQUIRED");
        });

        it("다른 관리자가 먼저 상태를 변경한 경우 409 STATE_CHANGED 에러를 반환한다", async () => {
            vi.mocked(transition).mockRejectedValueOnce(new AppError("STATE_CHANGED", 409));

            const req = new NextRequest("http://localhost:3000/api/admin/orders/order-1/transition", {
                method: "POST",
                body: JSON.stringify({ action: "start_cooking" }),
            });
            const res = await postTransition(req, {
                params: Promise.resolve({ id: "order-1" }),
            });

            expect(res.status).toBe(409);
            const data = await res.json();
            expect(data.error.code).toBe("STATE_CHANGED");
        });
    });
});
