import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { AppError } from "@/lib/api/errors";

// 정상 경로·DB 예외 변환은 통합 테스트가 실제 DB로 확인한다. 여기서는 실제 DB로 재현하기 어려운 장애만 본다.
const failing = {
  rpc: () => Promise.resolve({ data: null, error: { message: "connection refused", code: "08006" } }),
} as unknown as SupabaseClient;

describe("supabaseOrderRepository — 상태 전환 장애", () => {
  it("알 수 없는 DB 에러는 AppError가 아닌 일반 에러로 던진다(핸들러가 500으로 숨기고 기록)", async () => {
    const error = await createSupabaseOrderRepository(failing).transition({
      orderId: "22222222-2222-4222-8222-222222222222", from: "pending", to: "paid", action: "confirm_payment",
      actorType: "admin", actorId: null, reason: null, refundChannel: null,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
    expect((error as Error).message).toContain("08006");
  });
});
