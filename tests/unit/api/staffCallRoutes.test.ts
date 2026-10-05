import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn().mockReturnValue({}) }));
vi.mock("@/infra/repositories/supabaseOrderRepository", () => ({ createSupabaseOrderRepository: vi.fn().mockReturnValue({}) }));
vi.mock("@/infra/repositories/staffCallRepository", () => ({ SupabaseStaffCallRepository: class { createCallIfAllowed = vi.fn(); listCalls = vi.fn(); acknowledgeCall = vi.fn(); } }));
vi.mock("@/infra/supabase/session", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/services/staffCallService");

import { NextRequest } from "next/server";
import { POST as callStaffRoute } from "@/app/api/orders/[token]/call-staff/route";
import { GET as listStaffCallsRoute } from "@/app/api/admin/staff-calls/route";
import { POST as ackStaffCallRoute } from "@/app/api/admin/staff-calls/[id]/acknowledge/route";
import { callStaff, getStaffCalls, acknowledgeStaffCall } from "@/services/staffCallService";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";

describe("T-27 staffCall API Routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("고객 호출 성공 시 201과 cache-control을 반환한다", async () => {
    vi.mocked(callStaff).mockResolvedValueOnce({ callId: "11111111-1111-4111-8111-111111111111", orderId: "22222222-2222-4222-8222-222222222222", pickupNumber: 42, calledAt: "2026-10-04T12:00:00.000Z", cooldownSeconds: 120 });
    const response = await callStaffRoute(new NextRequest("http://localhost/api/orders/token/call-staff", { method: "POST" }), { params: Promise.resolve({ token: "token" }) });
    expect(response.status).toBe(201); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("쿨다운 중이면 429와 Retry-After를 반환한다", async () => {
    vi.mocked(callStaff).mockRejectedValueOnce(new AppError("CALL_COOLDOWN", 429, { retryAfterSeconds: 45 }));
    const response = await callStaffRoute(new NextRequest("http://localhost/api/orders/token/call-staff", { method: "POST" }), { params: Promise.resolve({ token: "token" }) });
    const body = await response.json();
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("45");
    expect(body.error).toMatchObject({ code: "CALL_COOLDOWN", details: { retryAfterSeconds: 45 } });
  });

  it("없는 주문 토큰은 404", async () => {
    vi.mocked(callStaff).mockRejectedValueOnce(new AppError("NOT_FOUND", 404));
    const response = await callStaffRoute(new NextRequest("http://localhost/api/orders/nope/call-staff", { method: "POST" }), { params: Promise.resolve({ token: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("관리자 목록 API는 미인증이면 401", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
    const response = await listStaffCallsRoute(new NextRequest("http://localhost/api/admin/staff-calls"));
    expect(response.status).toBe(401);
  });

  it("관리자 목록 API는 호출 목록을 반환한다", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ id: "admin-1", email: "admin@test.com" } as never);
    vi.mocked(getStaffCalls).mockResolvedValueOnce({ calls: [], unacknowledgedCount: 0 });
    const response = await listStaffCallsRoute(new NextRequest("http://localhost/api/admin/staff-calls"));
    expect(response.status).toBe(200); expect((await response.json()).unacknowledgedCount).toBe(0);
  });

  it("관리자 확인 API는 미인증이면 401", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
    const response = await ackStaffCallRoute(undefined, { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(401);
  });

  it("관리자 확인 API는 갱신된 호출을 반환한다", async () => {
    vi.mocked(requireAdmin).mockResolvedValueOnce({ id: "33333333-3333-4333-8333-333333333333", email: "admin@test.com" } as never);
    vi.mocked(acknowledgeStaffCall).mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111", orderId: "22222222-2222-4222-8222-222222222222", pickupNumber: 15, calledAt: "2026-10-04T12:00:00.000Z", acknowledgedAt: "2026-10-04T12:02:00.000Z", acknowledgedBy: "33333333-3333-4333-8333-333333333333" });
    const response = await ackStaffCallRoute(undefined, { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(200);
  });
});
