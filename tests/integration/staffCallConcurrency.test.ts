import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

const db = createServiceClient();
const createdOrders: string[] = [];

async function createOrder() {
  const { data, error } = await db.from("orders").insert({ pickup_number: randomInt(100_000, 2_000_000_000), status: "pending", payment_method: "cash", total_amount: 0, idempotency_key: randomUUID(), status_token: randomUUID() }).select("id").single();
  if (error) throw error;
  createdOrders.push(data.id);
  return data.id as string;
}

function call(orderId: string, now: Date) {
  return db.rpc("create_staff_call_if_allowed", { p_order_id: orderId, p_now: now.toISOString() });
}

afterEach(async () => { if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0)); });

describe("T-27 create_staff_call_if_allowed", () => {
  test("같은 주문의 동시 호출 2건은 DB에서 직렬화되어 1건만 생성된다", async () => {
    const orderId = await createOrder();
    const now = new Date("2026-10-07T03:00:00.000Z");
    const [first, second] = await Promise.all([call(orderId, now), call(orderId, now)]);
    expect(first.error).toBeNull(); expect(second.error).toBeNull();
    const rows = [first.data?.[0], second.data?.[0]];
    expect(rows.map((row) => row?.accepted).sort()).toEqual([false, true]);
    expect(rows.find((row) => row?.accepted === false)?.retry_after_seconds).toBe(120);
    const { count, error } = await db.from("staff_calls").select("id", { count: "exact", head: true }).eq("order_id", orderId);
    expect(error).toBeNull(); expect(count).toBe(1);
  });

  test("119초에는 거부하고 정확히 120초에는 새 호출을 허용한다", async () => {
    const orderId = await createOrder();
    const base = new Date("2026-10-07T03:00:00.000Z");
    const first = await call(orderId, base);
    const blocked = await call(orderId, new Date(base.getTime() + 119000));
    const allowed = await call(orderId, new Date(base.getTime() + 120000));
    expect(first.error).toBeNull(); expect(first.data?.[0]?.accepted).toBe(true);
    expect(blocked.error).toBeNull(); expect(blocked.data?.[0]).toMatchObject({ accepted: false, retry_after_seconds: 1 });
    expect(allowed.error).toBeNull(); expect(allowed.data?.[0]?.accepted).toBe(true);
  });
});
