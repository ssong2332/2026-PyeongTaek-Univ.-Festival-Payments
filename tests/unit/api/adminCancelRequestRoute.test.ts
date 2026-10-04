import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
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
import type { User } from "@supabase/supabase-js";
import { POST } from "@/app/api/admin/orders/[id]/cancel-request/route";
import { requireAdmin } from "@/infra/supabase/session";
import { resolveCancelRequest } from "@/services/adminOrderService";
import { AppError } from "@/lib/api/errors";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

// 승인·거절 규칙은 서비스·저장소 테스트가 확인한다. 여기서는 인증·요청 검사·값 전달·HTTP 응답 모양만 본다.
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "admin-user-123";

const order: AdminOrderDto = {
    id: ORDER_ID,
    pickupNumber: 101,
    status: "paid",
    paymentMethod: "transfer",
    totalAmount: 6000,
    items: [],
    createdAt: "2026-10-07T02:50:00Z",
    updatedAt: "2026-10-07T03:00:00Z",
    acknowledgedAt: null,
    transferReportedAt: null,
    cancelRequestedAt: "2026-10-07T02:55:00Z",
    cancelRejectedAt: "2026-10-07T03:00:00Z",
    paidAt: "2026-10-07T02:52:00Z",
    cookingStartedAt: null,
    completedAt: null,
    closedAt: null,
    refundChannel: null,
    lastReason: "조리 준비 중",
    availableActions: ["start_cooking", "cancel"],
};

async function post(body: unknown, id: string = ORDER_ID) {
    const request = new NextRequest(`http://localhost:3000/api/admin/orders/${id}/cancel-request`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const response = await POST(request, { params: Promise.resolve({ id }) });
    return { status: response.status, json: await response.json() };
}

describe("POST /api/admin/orders/[id]/cancel-request", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: ADMIN_ID, email: "admin@test.com" } as unknown as User);
        vi.mocked(resolveCancelRequest).mockResolvedValue(order);
    });

    it.each(["approve", "reject"] as const)("%s: 주문 id·결정·사유·관리자 id를 서비스에 넘기고 200 AdminOrderDto", async (decision) => {
        expect(await post({ decision, reason: "조리 준비 중" })).toEqual({ status: 200, json: order });
        expect(vi.mocked(resolveCancelRequest).mock.calls[0][0]).toEqual({
            orderId: ORDER_ID, decision, reason: "조리 준비 중", adminId: ADMIN_ID,
        });
        expect(vi.mocked(resolveCancelRequest).mock.calls[0][1]).toHaveProperty("orderRepository");
        expect(vi.mocked(resolveCancelRequest).mock.calls[0][1]).toHaveProperty("adminOrderRepository");
    });

    it("인증되지 않은 사용자는 401 UNAUTHORIZED, 서비스를 부르지 않는다", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const { status, json } = await post({ decision: "reject", reason: "사유" }, "abc");
        expect(status).toBe(401);
        expect(json.error.code).toBe("UNAUTHORIZED");
        expect(resolveCancelRequest).not.toHaveBeenCalled();
    });

    it("id가 uuid 형식이 아니면 400 VALIDATION_ERROR", async () => {
        const { status, json } = await post({ decision: "reject", reason: "사유" }, "abc");
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(resolveCancelRequest).not.toHaveBeenCalled();
    });

    it.each([
        ["본문이 JSON이 아님", "not json"],
        ["decision 없음", { reason: "사유" }],
        ["decision이 approve·reject가 아님", { decision: "cancel", reason: "사유" }],
        ["reason 없음", { decision: "reject" }],
        ["reason 빈 문자열(승인)", { decision: "approve", reason: "" }],
        ["reason 빈 문자열(거절)", { decision: "reject", reason: "" }],
        ["reason 201자", { decision: "reject", reason: "가".repeat(201) }],
        ["규격에 없는 필드(strict)", { decision: "reject", reason: "사유", price: 0 }],
    ])("%s → 400 VALIDATION_ERROR, 서비스를 부르지 않는다", async (_name, body) => {
        const { status, json } = await post(body);
        expect(status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(resolveCancelRequest).not.toHaveBeenCalled();
    });

    it("reason 200자는 통과한다", async () => {
        expect((await post({ decision: "reject", reason: "가".repeat(200) })).status).toBe(200);
    });

    it.each([
        ["REASON_REQUIRED", 400],
        ["NOT_FOUND", 404],
        ["INVALID_TRANSITION", 409],
        ["STATE_CHANGED", 409],
    ] as const)("서비스가 던진 %s는 %i 봉투로 돌려준다", async (code, httpStatus) => {
        vi.mocked(resolveCancelRequest).mockRejectedValueOnce(new AppError(code, httpStatus));
        const { status, json } = await post({ decision: "reject", reason: "   " });
        expect(status).toBe(httpStatus);
        expect(json.error.code).toBe(code);
    });

    it("알 수 없는 오류는 500으로 숨긴다", async () => {
        vi.mocked(resolveCancelRequest).mockRejectedValueOnce(new Error("db down"));
        const { status, json } = await post({ decision: "approve", reason: "사유" });
        expect(status).toBe(500);
        expect(JSON.stringify(json)).not.toContain("db down");
    });
});
