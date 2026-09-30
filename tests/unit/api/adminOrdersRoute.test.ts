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

// 라우트가 id를 uuid로 검증하므로 픽스처 id도 유효한 uuid를 쓴다.
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_ORDER_ID = "22222222-2222-4222-8222-222222222222";
const MALFORMED_ID = "abc";
// supabase/seed.sql 형식의 ID. RFC variant 비트가 맞지 않아 Zod 4 z.uuid()는 거부하지만
// PostgreSQL uuid 컬럼에는 정상 저장되므로 라우트는 통과시켜야 한다(z.guid() 회귀 방지).
const SEED_STYLE_ID = "11111111-1111-1111-1111-111111111111";

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

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${ORDER_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: ORDER_ID }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("존재하는 주문의 단건 조회가 성공하면 200 JSON을 반환한다", async () => {
            const mockOrder = createMockOrder(ORDER_ID, null);

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(mockOrder),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${ORDER_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: ORDER_ID }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(ORDER_ID);
        });

        it("주문이 없으면 404 NOT_FOUND 에러를 반환한다", async () => {
            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(null),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${MISSING_ORDER_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: MISSING_ORDER_ID }),
            });

            expect(res.status).toBe(404);
            const data = await res.json();
            expect(data.error.code).toBe("NOT_FOUND");
        });

        it("seed 형식 id(RFC variant 비준수)도 형식 검증을 통과해 200을 반환한다", async () => {
            const mockOrder = createMockOrder(SEED_STYLE_ID, null);

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(mockOrder),
                    acknowledge: vi.fn(),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${SEED_STYLE_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: SEED_STYLE_ID }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe(SEED_STYLE_ID);
        });

        it("id가 uuid 형식이 아니면 DB 조회 없이 400 VALIDATION_ERROR를 반환한다", async () => {
            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${MALFORMED_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: MALFORMED_ID }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("VALIDATION_ERROR");
            // 형식 오류는 리포지토리(→ PostgREST 22P02 → 500)까지 내려가지 않아야 한다.
            expect(SupabaseAdminOrderRepository).not.toHaveBeenCalled();
        });

        it("미인증 요청은 id 형식이 틀려도 401이 먼저 반환된다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${MALFORMED_ID}`);
            const res = await getOrderById(req, {
                params: Promise.resolve({ id: MALFORMED_ID }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });
    });

    describe("POST /api/admin/orders/[id]/acknowledge", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${ORDER_ID}/acknowledge`, {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: ORDER_ID }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });

        it("주문 확인이 성공하면 200 JSON과 갱신된 주문을 반환한다", async () => {
            const unacked = createMockOrder(ORDER_ID, null);
            const acked = createMockOrder(ORDER_ID, "2026-09-25T10:05:00Z");

            vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () {
                return {
                    list: vi.fn(),
                    findById: vi.fn().mockResolvedValue(unacked),
                    acknowledge: vi.fn().mockResolvedValue(acked),
                } as unknown as SupabaseAdminOrderRepository;
            });

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${ORDER_ID}/acknowledge`, {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: ORDER_ID }),
            });

            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.acknowledgedAt).toBe("2026-09-25T10:05:00Z");
        });

        it("id가 uuid 형식이 아니면 DB 갱신 없이 400 VALIDATION_ERROR를 반환한다", async () => {
            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${MALFORMED_ID}/acknowledge`, {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: MALFORMED_ID }),
            });

            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error.code).toBe("VALIDATION_ERROR");
            expect(SupabaseAdminOrderRepository).not.toHaveBeenCalled();
        });

        it("미인증 요청은 id 형식이 틀려도 401이 먼저 반환된다", async () => {
            vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const req = new NextRequest(`http://localhost:3000/api/admin/orders/${MALFORMED_ID}/acknowledge`, {
                method: "POST",
            });
            const res = await postAcknowledge(req, {
                params: Promise.resolve({ id: MALFORMED_ID }),
            });

            expect(res.status).toBe(401);
            const data = await res.json();
            expect(data.error.code).toBe("UNAUTHORIZED");
        });
    });
});
