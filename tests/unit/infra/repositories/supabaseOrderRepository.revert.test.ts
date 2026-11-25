import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { AppError } from "@/lib/api/errors";

const orderId = "22222222-2222-4222-8222-222222222222";
const actorId = "11111111-1111-4111-8111-111111111111";
const command = {
  orderId, from: "cooking" as const, to: "pending" as const,
  action: "revert_to_pending" as const, actorType: "admin" as const,
  actorId, reason: "입금 확인 실수", refundChannel: null,
};

function repository(error: { message: string; code?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({
    data: error ? null : { id: orderId, status: "pending", payment_method: "transfer" },
    error,
  });
  return { repo: createSupabaseOrderRepository({ rpc } as unknown as SupabaseClient), rpc };
}

describe("T-55 되돌리기 저장소", () => {
  it("0107 전용 RPC에 필요한 인자 세 개만 전달한다", async () => {
    const { repo, rpc } = repository();
    expect(await repo.transition(command)).toMatchObject({ id: orderId, status: "pending" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("revert_transfer_order_to_pending", {
      p_order_id: orderId, p_actor_id: actorId, p_reason: "입금 확인 실수",
    });
  });

  it.each([
    ["ORDER_NOT_FOUND", "NOT_FOUND", 404],
    ["INVALID_TRANSITION", "INVALID_TRANSITION", 409],
    ["REASON_REQUIRED", "REASON_REQUIRED", 400],
    ["VALIDATION_ERROR", "VALIDATION_ERROR", 400],
  ] as const)("DB %s를 API %s/%s로 매핑한다", async (message, code, status) => {
    const { repo } = repository({ message });
    await expect(repo.transition(command)).rejects.toMatchObject({ code, status });
  });

  it("예상하지 못한 DB 장애는 내부 오류로 숨길 수 있는 일반 Error로 넘긴다", async () => {
    const { repo } = repository({ message: "connection refused", code: "08006" });
    const error = await repo.transition(command).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
  });
});
