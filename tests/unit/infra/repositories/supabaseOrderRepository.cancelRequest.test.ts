import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn() } }));

import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { AppError } from "@/lib/api/errors";

// 거절 기록(T-35)은 DB 함수 없이 "조건부 갱신 → 이력 추가" 두 번의 호출이라 원자적이지 않다.
// 이력 추가가 실패했을 때 거절 시각을 되돌리는 경로는 실제 DB로 만들 수 없어 가짜 클라이언트로 확인한다.
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";

type Response = { data: unknown; error: { message: string; code?: string } | null };
type Call = { table: string; steps: [string, ...unknown[]][] };

// supabase-js의 from(...) 체인만 흉내 낸다. from을 부른 순서대로 준비된 응답을 돌려주고, 체인 호출을 기록한다.
function fakeClient(responses: Response[]) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, steps: [] };
      calls.push(call);
      const response = responses[calls.length - 1] ?? { data: null, error: { message: "unexpected call" } };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: Response) => unknown) => Promise.resolve(response).then(resolve),
      };
      for (const method of ["update", "insert", "eq", "in", "is", "not", "select"]) {
        builder[method] = (...args: unknown[]) => {
          call.steps.push([method, ...args]);
          return builder;
        };
      }
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const updated: Response = { data: [{ status: "paid" }], error: null };
const ok: Response = { data: null, error: null };
const failed: Response = { data: null, error: { message: "boom", code: "XX000" } };

beforeEach(() => {
  logError.mockReset();
});

describe("supabaseOrderRepository.rejectCancelRequest", () => {
  it("조건에 맞는 주문만 거절 시각을 기록하고, 상태를 그대로 둔 이력 1행을 남긴다", async () => {
    const { client, calls } = fakeClient([updated, ok]);
    expect(await createSupabaseOrderRepository(client).rejectCancelRequest(ORDER_ID, ADMIN_ID, "조리 준비 중")).toBe(true);

    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("orders");
    const [update, ...conditions] = calls[0].steps;
    expect(update[0]).toBe("update");
    expect(Object.keys(update[1] as object)).toEqual(["cancel_rejected_at"]);
    expect(conditions).toEqual(expect.arrayContaining([
      ["eq", "id", ORDER_ID],
      ["in", "status", ["pending", "paid"]],
      ["not", "cancel_requested_at", "is", null],
      ["is", "cancel_rejected_at", null],
    ]));
    expect(calls[1]).toEqual({
      table: "order_status_history",
      steps: [["insert", {
        order_id: ORDER_ID, from_status: "paid", to_status: "paid", action: "cancel_request_reject",
        actor_type: "admin", actor_id: ADMIN_ID, reason: "조리 준비 중",
      }]],
    });
  });

  it("갱신된 행이 없으면(요청 없음·이미 거절·상태 바뀜) false, 이력을 남기지 않는다", async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }]);
    expect(await createSupabaseOrderRepository(client).rejectCancelRequest(ORDER_ID, ADMIN_ID, "사유")).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("이력 추가가 실패하면 거절 시각을 되돌리고 500 INTERNAL_ERROR", async () => {
    const { client, calls } = fakeClient([updated, failed, ok]);
    const error = await createSupabaseOrderRepository(client).rejectCancelRequest(ORDER_ID, ADMIN_ID, "사유").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(calls).toHaveLength(3);
    expect(calls[2].table).toBe("orders");
    expect(calls[2].steps).toEqual(expect.arrayContaining([
      ["update", { cancel_rejected_at: null }],
      ["eq", "id", ORDER_ID],
    ]));
    expect(logError).not.toHaveBeenCalled();
  });

  it("되돌리기까지 실패하면 주문 id와 함께 오류 로그를 남기고 500 INTERNAL_ERROR", async () => {
    const { client } = fakeClient([updated, failed, failed]);
    const error = await createSupabaseOrderRepository(client).rejectCancelRequest(ORDER_ID, ADMIN_ID, "사유").catch((e: unknown) => e);

    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][0]).toBe("order.cancel_request_reject.rollback_failed");
    expect(logError.mock.calls[0][2]).toEqual({ orderId: ORDER_ID });
  });

  it("거절 시각 갱신 자체가 실패하면 그대로 던지고 이력을 남기지 않는다", async () => {
    const { client, calls } = fakeClient([failed]);
    await expect(createSupabaseOrderRepository(client).rejectCancelRequest(ORDER_ID, ADMIN_ID, "사유")).rejects.toThrow("boom");
    expect(calls).toHaveLength(1);
  });
});
