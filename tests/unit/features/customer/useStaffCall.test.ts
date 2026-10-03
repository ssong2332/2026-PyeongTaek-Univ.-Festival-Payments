// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStaffCall } from "@/features/customer/useStaffCall";

describe("T-27 useStaffCall Hook", () => {
  const dummyToken = "test-token-123";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("초기 상태는 호출 가능하고 쿨다운이 0초이다", () => {
    const { result } = renderHook(() => useStaffCall(dummyToken));

    expect(result.current.isCalling).toBe(false);
    expect(result.current.cooldownRemaining).toBe(0);
    expect(result.current.message).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it("호출 성공 시 cooldownRemaining이 120초로 설정되고 성공 메시지가 표시된다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        callId: "11111111-1111-4111-8111-111111111111",
        orderId: "22222222-2222-4222-8222-222222222222",
        pickupNumber: 42,
        calledAt: "2026-10-04T12:00:00.000Z",
        cooldownSeconds: 120,
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useStaffCall(dummyToken));

    let success = false;
    await act(async () => {
      success = await result.current.callStaff();
    });

    expect(success).toBe(true);
    expect(result.current.cooldownRemaining).toBe(120);
    expect(result.current.message).toBe("직원을 호출했습니다. 잠시만 기다려 주세요.");
    expect(result.current.errorMessage).toBeNull();

    // 1초 경과 시 119초로 카운트다운
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.cooldownRemaining).toBe(119);
  });

  it("서버에서 429 CALL_COOLDOWN 응답이 오면 남은 쿨다운을 반영한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: "CALL_COOLDOWN",
          message: "Please wait before calling staff again.",
          details: { retryAfter: 45 },
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useStaffCall(dummyToken));

    let success = true;
    await act(async () => {
      success = await result.current.callStaff();
    });

    expect(success).toBe(false);
    expect(result.current.cooldownRemaining).toBe(45);
    expect(result.current.errorMessage).toBe("잠시 후 다시 호출 가능합니다.");
  });
});
