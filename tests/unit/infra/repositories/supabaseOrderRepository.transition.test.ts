import { describe, expect, it, vi } from "vitest";
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
      expectedCancel: { requestedAt: null, rejectedAt: null },
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

    it.each([
        { action: "confirm_payment", from: "pending" },
        { action: "confirm_cash", from: "pending" },
        { action: "start_cooking", from: "paid" },
    ] as const)("$action: 기대값이 둘 다 null이어도 보호 함수를 부르고 null을 그대로 넘긴다", async ({ action, from }) => {
        const { client, calls } = recording();
        await createSupabaseOrderRepository(client).transition({ ...base, action, from, expectedCancel: { requestedAt: null, rejectedAt: null } });
        expect(calls).toHaveLength(1);
        expect(calls[0].fn).toBe(GUARDED_TRANSITION.fn);
        expect(calls[0].args).toMatchObject({
            p_order_id: base.orderId, p_from: from, p_to: "cooking", p_action: action,
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

    it("취소(고객 요청 승인 포함)는 기존 transition_order를 쓰고 기대값 인자를 보내지 않는다", async () => {
        const { client, calls } = recording();
        await createSupabaseOrderRepository(client).transition({ ...base, action: "cancel", to: "cancelled", reason: "고객 요청" });
        expect(calls[0].fn).toBe("transition_order");
        expect(calls[0].args).not.toHaveProperty(GUARDED_TRANSITION.expectedRequestedAt);
        expect(calls[0].args).not.toHaveProperty(GUARDED_TRANSITION.expectedRejectedAt);
    });
});

// #167(김 혁) 아이디어 반영: 보호 대상 동작인데 조회 시점 값이 빠지면 기존 함수로 조용히 가지 않고 바로 멈춘다.
describe("supabaseOrderRepository — 보호 대상인데 기대값이 빠진 호출", () => {
    it.each([
        { action: "confirm_payment", from: "pending" },
        { action: "confirm_cash", from: "pending" },
        { action: "start_cooking", from: "paid" },
    ] as const)("$action: 일반 에러로 멈추고 DB는 부르지 않는다", async ({ action, from }) => {
        const rpc = vi.fn();
        const error = await createSupabaseOrderRepository({ rpc } as unknown as SupabaseClient).transition({
            orderId: "22222222-2222-4222-8222-222222222222", from, to: "cooking", action,
            actorType: "admin", actorId: null, reason: null, refundChannel: null,
        }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AppError);
        expect(rpc).not.toHaveBeenCalled();
    });
});
