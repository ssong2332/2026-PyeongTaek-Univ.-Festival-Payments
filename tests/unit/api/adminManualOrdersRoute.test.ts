import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn().mockReturnValue({}) }));
vi.mock("@/infra/repositories/supabaseManualOrderRepository", () => ({
    createSupabaseManualOrderRepository: vi.fn().mockReturnValue({ kind: "manual-order-repository" }),
}));
vi.mock("@/services/manualOrderService");

import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { POST } from "@/app/api/admin/manual-orders/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { ManualOrderResponse } from "@/lib/dto/manualOrder";
import { createManualOrder } from "@/services/manualOrderService";

// T-28 POST /api/admin/manual-orders — 저장 규칙은 서비스·DB 통합 테스트가 확인한다.
// 여기서는 인증·요청 검사·값 전달·HTTP 응답 모양만 본다.
const ADMIN_ID = "admin-user-123";
const body = {
    idempotencyKey: "3f0e7b3a-5c1d-4e6f-8a9b-0c1d2e3f4a5b",
    paymentMethod: "cash",
    manualOrderedAt: "2026-10-07T03:00:00.000Z",
    manualNumber: 12,
    items: [{ menuItemId: "11111111-1111-1111-1111-111111111111", quantity: 2, optionIds: [] }],
};
const saved: ManualOrderResponse = {
    orderId: "22222222-2222-2222-2222-222222222222", manualNumber: 12, displayNumber: "M-012",
    status: "completed", paymentMethod: "cash", totalAmount: 4000,
    manualOrderedAt: body.manualOrderedAt, createdAt: "2026-10-07T04:00:00.000Z", created: true, stockShortages: [],
};

function post(payload: unknown, raw = false) {
    return POST(new NextRequest("http://localhost/api/admin/manual-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: raw ? (payload as string) : JSON.stringify(payload),
    }));
}

describe("POST /api/admin/manual-orders", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: ADMIN_ID } as User);
        vi.mocked(createManualOrder).mockResolvedValue(saved);
    });

    it("관리자 세션이 없으면 본문과 무관하게 401 — 서비스·DB를 부르지 않는다", async () => {
        vi.mocked(requireAdmin).mockRejectedValue(new AppError("UNAUTHORIZED", 401));

        for (const response of [await post(body), await post("not json", true), await post({})]) {
            expect(response.status).toBe(401);
            expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        }
        expect(createManualOrder).not.toHaveBeenCalled();
        expect(createServiceClient).not.toHaveBeenCalled();
    });

    it("새 주문은 201, 요청과 관리자 id를 서비스에 넘기고 캐시를 막는다", async () => {
        const response = await post(body);

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual(saved);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(createManualOrder).toHaveBeenCalledExactlyOnceWith(body, {
            manualOrderRepository: { kind: "manual-order-repository" },
            adminId: ADMIN_ID,
        });
    });

    it("같은 멱등키 재요청(created=false)은 200으로 같은 주문을 돌려준다", async () => {
        vi.mocked(createManualOrder).mockResolvedValue({ ...saved, created: false });

        const response = await post(body);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ...saved, created: false });
    });

    it.each([
        ["JSON이 아닌 본문", "not json", true],
        ["빈 객체", {}, false],
        ["가격 필드 포함", { ...body, totalAmount: 100 }, false],
        ["규격에 없는 필드", { ...body, unexpected: true }, false],
        ["수기 번호 없음", { ...body, manualNumber: undefined }, false],
        ["수기 번호 0", { ...body, manualNumber: 0 }, false],
        ["수기 번호 문자열", { ...body, manualNumber: "M-012" }, false],
        ["항목 없음", { ...body, items: [] }, false],
        ["오프셋 없는 시각", { ...body, manualOrderedAt: "2026-10-07T12:00:00" }, false],
    ])("%s → 400 VALIDATION_ERROR, 서비스를 부르지 않는다", async (_name, payload, raw) => {
        const response = await post(payload, raw);

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
        expect(createManualOrder).not.toHaveBeenCalled();
    });

    it.each([
        ["MANUAL_NUMBER_TAKEN", 409],
        ["MENU_UNAVAILABLE", 409],
        ["INVALID_OPTION", 409],
        ["VALIDATION_ERROR", 400],
    ] as const)("서비스 오류 %s 는 공통 오류 응답(%s)으로 나간다", async (code, status) => {
        vi.mocked(createManualOrder).mockRejectedValue(new AppError(code, status, { manualNumber: 12 }));

        const response = await post(body);

        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ error: { code } });
    });

    it("예상 밖 오류는 내부 내용 없이 500", async () => {
        vi.mocked(createManualOrder).mockRejectedValue(new Error("create_manual_order failed: secret db detail"));

        const response = await post(body);
        const json = await response.json();

        expect(response.status).toBe(500);
        expect(json.error.code).toBe("INTERNAL_ERROR");
        expect(JSON.stringify(json)).not.toContain("secret db detail");
    });
});
