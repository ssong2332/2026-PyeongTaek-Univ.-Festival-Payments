import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/supabaseOrderRepository", () => ({
    createSupabaseOrderRepository: vi.fn().mockReturnValue({}),
}));
vi.mock("@/services/orderService");

import { NextRequest } from "next/server";
import { GET as getOrderStatus } from "@/app/api/orders/[token]/route";
import { getOrderByToken } from "@/services/orderService";
import { AppError } from "@/lib/api/errors";
import type { OrderStatusDto } from "@/lib/dto/order";

const VALID_TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

const mockOrderStatus: OrderStatusDto = {
    orderId: "order-123",
    pickupNumber: 101,
    status: "pending",
    paymentMethod: "transfer",
    totalAmount: 6000,
    items: [
        {
            name: "씨앗호떡",
            quantity: 2,
            options: ["설탕 보통"],
            lineTotal: 6000,
        },
    ],
    createdAt: "2026-09-28T10:00:00Z",
    transferReportedAt: null,
    cancelRequestedAt: null,
    cancelRejectedAt: null,
    aheadCount: 2,
    canTransferReport: true,
    canCancelRequest: true,
};

describe("GET /api/orders/[token]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("유효한 토큰으로 주문 상태를 조회하면 200과 OrderStatusDto를 반환한다", async () => {
        vi.mocked(getOrderByToken).mockResolvedValueOnce(mockOrderStatus);

        const req = new NextRequest(`http://localhost:3000/api/orders/${VALID_TOKEN}`);
        const res = await getOrderStatus(req, {
            params: Promise.resolve({ token: VALID_TOKEN }),
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual(mockOrderStatus);
        expect(getOrderByToken).toHaveBeenCalledWith(VALID_TOKEN, expect.any(Object));
    });

    it("주문이 없거나 토큰 형식이 틀려 서비스가 404를 던지면 404 NOT_FOUND를 반환한다", async () => {
        vi.mocked(getOrderByToken).mockRejectedValueOnce(new AppError("NOT_FOUND", 404));

        const req = new NextRequest("http://localhost:3000/api/orders/invalid-token");
        const res = await getOrderStatus(req, {
            params: Promise.resolve({ token: "invalid-token" }),
        });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.error.code).toBe("NOT_FOUND");
    });
});
