// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStaffCall } from "@/features/customer/useStaffCall";

describe("T-27 useStaffCall", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());

  it("호출 성공 시 120초 쿨다운과 성공 메시지를 표시한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ callId: "11111111-1111-4111-8111-111111111111", orderId: "22222222-2222-4222-8222-222222222222", pickupNumber: 42, calledAt: "2026-10-04T12:00:00.000Z", cooldownSeconds: 120 }) } as Response);
    const { result } = renderHook(() => useStaffCall("token"));
    await act(async () => { expect(await result.current.callStaff()).toBe(true); });
    expect(result.current.cooldownRemaining).toBe(120); expect(result.current.message).toContain("직원을 호출했습니다");
    act(() => vi.advanceTimersByTime(1000)); expect(result.current.cooldownRemaining).toBe(119);
  });

  it("429의 retryAfterSeconds를 고객 카운트다운에 반영한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: { code: "CALL_COOLDOWN", details: { retryAfterSeconds: 45 } } }) } as Response);
    const { result } = renderHook(() => useStaffCall("token"));
    await act(async () => { expect(await result.current.callStaff()).toBe(false); });
    expect(result.current.cooldownRemaining).toBe(45); expect(result.current.errorMessage).toBe("잠시 후 다시 호출 가능합니다.");
  });
});
