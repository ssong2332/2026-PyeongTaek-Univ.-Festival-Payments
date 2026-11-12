import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseOrderRepository, GUARDED_TRANSITION } from "@/infra/repositories/supabaseOrderRepository";
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

// #155·#161 리뷰(T-54): 읽은 취소 요청 값이 있으면 0106 보호 함수를, 없으면 기존 transition_order를 부른다.
describe("supabaseOrderRepository — 보호 함수 선택", () => {
    const base = {
        orderId: "22222222-2222-4222-8222-222222222222", from: "pending", to: "cooking", action: "confirm_payment",
        actorType: "admin", actorId: null, reason: null, refundChannel: null,
    } as const;

    function recording() {
        const calls: { fn: string; args: Record<string, unknown> }[] = [];
        const client = {
            rpc: (fn: string, args: Record<string, unknown>) => {
                calls.push({ fn, args });
                return Promise.resolve({ data: { id: base.orderId, status: "cooking", payment_method: "transfer" }, error: null });
            },
        } as unknown as SupabaseClient;
        return { client, calls };
    }

    it("기대값이 둘 다 null이어도 보호 함수를 부르고 null을 그대로 넘긴다", async () => {
        const { client, calls } = recording();
        await createSupabaseOrderRepository(client).transition({ ...base, expectedCancel: { requestedAt: null, rejectedAt: null } });
        expect(calls).toHaveLength(1);
        expect(calls[0].fn).toBe(GUARDED_TRANSITION.fn);
        expect(calls[0].args).toMatchObject({
            p_order_id: base.orderId, p_from: "pending", p_to: "cooking", p_action: "confirm_payment",
            [GUARDED_TRANSITION.expectedRequestedAt]: null, [GUARDED_TRANSITION.expectedRejectedAt]: null,
        });
        expect(Object.keys(calls[0].args)).toContain(GUARDED_TRANSITION.expectedRequestedAt);
        expect(Object.keys(calls[0].args)).toContain(GUARDED_TRANSITION.expectedRejectedAt);
    });

    it("읽은 시각 문자열을 바꾸지 않고 넘긴다", async () => {
        const { client, calls } = recording();
        const requestedAt = "2026-11-10T09:00:00.123456+00:00";
        const rejectedAt = "2026-11-10T09:01:00.654321+00:00";
        await createSupabaseOrderRepository(client).transition({ ...base, expectedCancel: { requestedAt, rejectedAt } });
        expect(calls[0].args).toMatchObject({
            [GUARDED_TRANSITION.expectedRequestedAt]: requestedAt, [GUARDED_TRANSITION.expectedRejectedAt]: rejectedAt,
        });
    });

    it("기대값이 없으면 기존 transition_order를 기존 인자 그대로 부른다", async () => {
        const { client, calls } = recording();
        await createSupabaseOrderRepository(client).transition({ ...base, action: "complete", from: "cooking", to: "completed" });
        expect(calls[0].fn).toBe("transition_order");
        expect(Object.keys(calls[0].args).sort()).toEqual([
            "p_action", "p_actor_id", "p_actor_type", "p_from", "p_order_id", "p_reason", "p_refund_channel", "p_to",
        ]);
    });
});

