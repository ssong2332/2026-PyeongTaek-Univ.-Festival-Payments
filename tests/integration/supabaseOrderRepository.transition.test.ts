import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { TransitionCommand } from "@/services/ports";

// 저장소 구현체가 transition_order를 올바른 인자로 부르고 DB 예외를 AppError로 바꾸는지 실제 DB로 확인한다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

async function createOrder(status: string) {
  const { data, error } = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
    payment_method: "cash",
    total_amount: 0,
    idempotency_key: randomUUID(),
    status_token: randomUUID(),
  }).select("id").single();
  if (error) throw error;
  createdOrders.push(data.id);
  return data.id as string;
}

function command(orderId: string, overrides: Partial<TransitionCommand> = {}): TransitionCommand {
  return {
    orderId, from: "pending", to: "cooking", action: "confirm_cash",
    actorType: "admin", actorId: randomUUID(), reason: null, refundChannel: null, ...overrides,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ code, status });
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
});

describe("supabaseOrderRepository — 상태 전환", () => {
  test("findById는 상태·결제수단을 돌려준다", async () => {
    const orderId = await createOrder("paid");
    expect(await repo.findById(orderId)).toEqual({ id: orderId, status: "paid", paymentMethod: "cash" });
  });

  test("findById는 없는 주문이면 null", async () => {
    expect(await repo.findById(randomUUID())).toBeNull();
  });

  test("transition은 갱신된 주문을 돌려주고 이력에 사유·주체를 남긴다", async () => {
    const orderId = await createOrder("paid");
    const actorId = randomUUID();
    const result = await repo.transition(command(orderId, {
      from: "paid", to: "cancelled", action: "cancel", actorId, reason: "고객 요청",
    }));

    expect(result).toEqual({ id: orderId, status: "cancelled", paymentMethod: "cash" });
    const { data } = await db.from("order_status_history").select("action, actor_id, reason").eq("order_id", orderId);
    expect(data).toEqual([{ action: "cancel", actor_id: actorId, reason: "고객 요청" }]);
  });

  test("환불 경로를 넘긴다", async () => {
    const orderId = await createOrder("cooking");
    await repo.transition(command(orderId, {
      from: "cooking", to: "refunded", action: "refund", reason: "재료 소진", refundChannel: "cash",
    }));
    const { data } = await db.from("orders").select("refund_channel").eq("id", orderId).single();
    expect(data?.refund_channel).toBe("cash");
  });

  test("CAS 실패는 409 STATE_CHANGED", async () => {
    const orderId = await createOrder("cooking");
    await expectAppError(repo.transition(command(orderId)), "STATE_CHANGED", 409);
  });

  test("없는 주문은 404 NOT_FOUND", async () => {
    await expectAppError(repo.transition(command(randomUUID())), "NOT_FOUND", 404);
  });

  test("종료 상태에서의 전환은 409 INVALID_TRANSITION", async () => {
    const orderId = await createOrder("completed");
    await expectAppError(
      repo.transition(command(orderId, { from: "completed", to: "cancelled", action: "cancel", reason: "고객 요청" })),
      "INVALID_TRANSITION", 409,
    );
  });
});
