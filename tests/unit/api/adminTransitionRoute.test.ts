import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");
vi.mock("@/infra/repositories/supabaseOrderRepository");
vi.mock("@/infra/repositories/adminOrderRepository");
vi.mock("@/services/adminOrderService");

import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/orders/[id]/transition/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { getAdminOrderById, transition } from "@/services/adminOrderService";
import { AppError } from "@/lib/api/errors";
import { makePreviewOrders } from "@/features/admin/DashboardPreview";

const id = "00000000-0000-4000-8000-000000000001";
const url = `http://localhost:3000/api/admin/orders/${id}/transition`;
const context = { params: Promise.resolve({ id }) };
const request = (body: string) => new NextRequest(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
});

describe("POST /api/admin/orders/[id]/transition", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-123" } as never);
        vi.mocked(createServiceClient).mockReturnValue({} as never);
        vi.mocked(createSupabaseOrderRepository).mockReturnValue({} as never);
        vi.mocked(SupabaseAdminOrderRepository).mockImplementation(function () { return {} as never; });
        vi.mocked(transition).mockResolvedValue({ id, status: "cooking", paymentMethod: "cash" });
        vi.mocked(getAdminOrderById).mockResolvedValue(makePreviewOrders()[2]);
    });

    it("세션이 없으면 전환 서비스와 service_role 클라이언트를 호출하지 않는다", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await POST(request('{"action":"confirm_cash"}'), context);
        expect(response.status).toBe(401);
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(transition).not.toHaveBeenCalled();
    });

    it("T-16 밖의 동작과 잘못된 요청은 400으로 거절한다", async () => {
        for (const body of ['{"action":"expire"}', '{"action":"cancel","reason":"test"}',
            '{"action":"confirm_cash","reason":"unexpected"}', '{']) {
            const response = await POST(request(body), context);
            expect(response.status).toBe(400);
            expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
        }
        expect(createServiceClient).not.toHaveBeenCalled();
    });

    it("관리자 ID와 action으로 전환한 뒤 갱신된 주문 DTO를 반환한다", async () => {
        const response = await POST(request('{"action":"confirm_cash"}'), context);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(makePreviewOrders()[2]);
        expect(transition).toHaveBeenCalledWith({
            orderId: id, action: "confirm_cash", adminId: "admin-123",
        }, { orderRepository: expect.anything() });
        expect(getAdminOrderById).toHaveBeenCalledWith(expect.anything(), id);
        expect(createServiceClient).toHaveBeenCalledTimes(1);
    });

    it("상태 충돌을 409로 반환하고 주문을 성공한 것처럼 읽지 않는다", async () => {
        vi.mocked(transition).mockRejectedValueOnce(new AppError("STATE_CHANGED", 409));
        const response = await POST(request('{"action":"complete"}'), context);
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe("STATE_CHANGED");
        expect(getAdminOrderById).not.toHaveBeenCalled();
    });
});
