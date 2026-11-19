import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { AppError } from "@/lib/api/errors";

// 정상 경로·DB 예외 변환은 통합 테스트가 실제 DB로 확인한다. 여기서는 실제 DB로 재현하기 어려운 장애만 본다.
const failing = {
  rpc: () => Promise.resolve({ data: null, error: { message: "connection refused", code: "08006" } }),
} as unknown as SupabaseClient;

describe("supabaseOrderRepository — 상태 전환 장애", () => {
  const baseCommand = {
    orderId: "22222222-2222-4222-8222-222222222222",
    from: "pending" as const,
    to: "cooking" as const,
    action: "confirm_payment" as const,
    actorType: "admin" as const,
    actorId: null,
    reason: null,
    refundChannel: null,
  };

  it.each(["confirm_payment", "confirm_cash", "start_cooking"] as const)(
    "%s 은 NULL 스냅샷도 원자적 0106 RPC에 명시해서 보낸다",
    async (action) => {
      const rpc = vi.fn().mockResolvedValue({
        data: { id: baseCommand.orderId, status: "cooking", payment_method: "cash", cancel_requested_at: null, cancel_rejected_at: null },
        error: null,
      });
      const repo = createSupabaseOrderRepository({ rpc } as unknown as SupabaseClient);
      await repo.transition({ ...baseCommand, action, expectedCancelRequestedAt: null, expectedCancelRejectedAt: null });
      expect(rpc).toHaveBeenCalledWith("transition_order_if_cancel_unchanged", expect.objectContaining({
        p_expected_cancel_requested_at: null,
        p_expected_cancel_rejected_at: null,
      }));
    },
  );

  it("조리중 진입에 스냅샷 인자가 빠지면 DB 호출 전에 거부한다", async () => {
    const rpc = vi.fn();
    const repo = createSupabaseOrderRepository({ rpc } as unknown as SupabaseClient);
    await expect(repo.transition(baseCommand)).rejects.toThrow("cancel snapshot is required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("취소는 기존 transition_order RPC를 사용한다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: baseCommand.orderId, status: "cancelled", payment_method: "cash", cancel_requested_at: null, cancel_rejected_at: null },
      error: null,
    });
    const repo = createSupabaseOrderRepository({ rpc } as unknown as SupabaseClient);
    await repo.transition({ ...baseCommand, action: "cancel", to: "cancelled", reason: "고객 요청" });
    expect(rpc.mock.calls[0][0]).toBe("transition_order");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_expected_cancel_requested_at");
  });

  it("알 수 없는 DB 에러는 AppError가 아닌 일반 에러로 던진다(핸들러가 500으로 숨기고 기록)", async () => {
    const error = await createSupabaseOrderRepository(failing).transition({
      orderId: "22222222-2222-4222-8222-222222222222", from: "pending", to: "paid", action: "confirm_payment",
      actorType: "admin", actorId: null, reason: null, refundChannel: null,
      expectedCancelRequestedAt: null, expectedCancelRejectedAt: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
    expect((error as Error).message).toContain("08006");
  });
});
