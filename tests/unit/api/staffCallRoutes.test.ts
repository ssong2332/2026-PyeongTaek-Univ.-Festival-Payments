import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/server", () => ({
  createServiceClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/supabaseOrderRepository", () => ({
  createSupabaseOrderRepository: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/staffCallRepository", () => ({
  SupabaseStaffCallRepository: class {
    getLatestCallByOrderId = vi.fn();
    createCall = vi.fn();
    listCalls = vi.fn();
    acknowledgeCall = vi.fn();
  },
}));
vi.mock("@/infra/supabase/session", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/services/staffCallService");

import { NextRequest } from "next/server";
import { POST as callStaffRoute } from "@/app/api/orders/[token]/call-staff/route";
import { GET as listStaffCallsRoute } from "@/app/api/admin/staff-calls/route";
import { POST as ackStaffCallRoute } from "@/app/api/admin/staff-calls/[id]/acknowledge/route";
import { callStaff, getStaffCalls, acknowledgeStaffCall } from "@/services/staffCallService";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";

describe("T-27 staffCall API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/orders/[token]/call-staff", () => {
    it("토큰으로 직원 호출 성공 시 201 응답과 캐시 방지 헤더를 반환한다", async () => {
      const mockResult = {
        callId: "11111111-1111-4111-8111-111111111111",
        orderId: "22222222-2222-4222-8222-222222222222",
        pickupNumber: 42,
        calledAt: "2026-10-04T12:00:00.000Z",
        cooldownSeconds: 120,
      };

      vi.mocked(callStaff).mockResolvedValueOnce(mockResult);

      const request = new NextRequest("http://localhost:3000/api/orders/abc123token/call-staff", {
        method: "POST",
      });

      const response = await callStaffRoute(request, {
        params: Promise.resolve({ token: "abc123token" }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.callId).toBe(mockResult.callId);
      expect(body.pickupNumber).toBe(42);
    });

    it("쿨다운 중이면 429 CALL_COOLDOWN 응답을 반환한다", async () => {
      vi.mocked(callStaff).mockRejectedValueOnce(
        new AppError("CALL_COOLDOWN", 429, { retryAfter: 45 })
      );

      const request = new NextRequest("http://localhost:3000/api/orders/abc123token/call-staff", {
        method: "POST",
      });

      const response = await callStaffRoute(request, {
        params: Promise.resolve({ token: "abc123token" }),
      });

      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error.code).toBe("CALL_COOLDOWN");
      expect(body.error.details.retryAfter).toBe(45);
    });

    it("토큰에 해당하는 주문이 없으면 404 NOT_FOUND를 반환한다", async () => {
      vi.mocked(callStaff).mockRejectedValueOnce(
        new AppError("NOT_FOUND", 404)
      );

      const request = new NextRequest("http://localhost:3000/api/orders/notfound/call-staff", {
        method: "POST",
      });

      const response = await callStaffRoute(request, {
        params: Promise.resolve({ token: "notfound" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("GET /api/admin/staff-calls", () => {
    it("미인증 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
      vi.mocked(requireAdmin).mockRejectedValueOnce(
        new AppError("UNAUTHORIZED", 401)
      );

      const request = new NextRequest("http://localhost:3000/api/admin/staff-calls");
      const response = await listStaffCallsRoute(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("인증된 관리자는 200과 직원 호출 목록을 반환받는다", async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: "admin-1",
        email: "admin@test.com",
      } as unknown as Awaited<ReturnType<typeof requireAdmin>>);

      const mockCalls = {
        calls: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            orderId: "22222222-2222-4222-8222-222222222222",
            pickupNumber: 15,
            calledAt: "2026-10-04T12:00:00.000Z",
            acknowledgedAt: null,
            acknowledgedBy: null,
          },
        ],
        unacknowledgedCount: 1,
      };

      vi.mocked(getStaffCalls).mockResolvedValueOnce(mockCalls);

      const request = new NextRequest("http://localhost:3000/api/admin/staff-calls");
      const response = await listStaffCallsRoute(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.unacknowledgedCount).toBe(1);
    });
  });

  describe("POST /api/admin/staff-calls/[id]/acknowledge", () => {
    it("미인증 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
      vi.mocked(requireAdmin).mockRejectedValueOnce(
        new AppError("UNAUTHORIZED", 401)
      );

      const response = await ackStaffCallRoute(undefined, {
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
      });

      expect(response.status).toBe(401);
    });

    it("인증된 관리자가 확인 요청 시 200과 확인 완료 정보를 반환받는다", async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        id: "admin-1",
        email: "admin@test.com",
      } as unknown as Awaited<ReturnType<typeof requireAdmin>>);

      const mockUpdated = {
        id: "11111111-1111-4111-8111-111111111111",
        orderId: "22222222-2222-4222-8222-222222222222",
        pickupNumber: 15,
        calledAt: "2026-10-04T12:00:00.000Z",
        acknowledgedAt: "2026-10-04T12:02:00.000Z",
        acknowledgedBy: "admin-1",
      };

      vi.mocked(acknowledgeStaffCall).mockResolvedValueOnce(mockUpdated);

      const response = await ackStaffCallRoute(undefined, {
        params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.acknowledgedBy).toBe("admin-1");
    });
  });
});
