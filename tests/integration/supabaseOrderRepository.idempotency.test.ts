import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";

// 멱등키 선조회(ADR-0009 ①)는 orders 테이블만 쓰므로 create_order 없이 실제 DB로 확인한다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
});

describe("supabaseOrderRepository.findByIdempotencyKey", () => {
  test("같은 멱등키 주문이 있으면 CreateOrderResponse(created=false)로 돌려준다", async () => {
    const idempotencyKey = randomUUID();
    const statusToken = randomBytes(32).toString("hex");
    const pickupNumber = randomInt(100_000, 2_000_000_000);
    const { data, error } = await db.from("orders").insert({
      pickup_number: pickupNumber, status: "paid", payment_method: "cash", total_amount: 7000,
      idempotency_key: idempotencyKey, status_token: statusToken,
    }).select("id, created_at").single();
    if (error) throw error;
    createdOrders.push(data.id);

    expect(await repo.findByIdempotencyKey(idempotencyKey)).toEqual({
      orderId: data.id,
      pickupNumber,
      statusToken,
      status: "paid",
      totalAmount: 7000,
      createdAt: new Date(data.created_at).toISOString(),
      created: false,
    });
  });

  test("없으면 null", async () => {
    expect(await repo.findByIdempotencyKey(randomUUID())).toBeNull();
  });
});
