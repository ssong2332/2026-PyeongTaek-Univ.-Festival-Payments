import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";

// 송금 신고(T-32, F-43)가 실제 DB에서 상태를 바꾸지 않고 최초 시각만 남기는지 확인한다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

const T1 = new Date("2026-10-07T03:00:00.000Z");
const T2 = new Date("2026-10-07T03:05:00.000Z");

async function createOrder(status: string, paymentMethod: "cash" | "transfer", reportedAt: string | null = null) {
  const statusToken = randomBytes(32).toString("hex");
  const { data, error } = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
    payment_method: paymentMethod,
    total_amount: 3000,
    idempotency_key: randomUUID(),
    status_token: statusToken,
    transfer_reported_at: reportedAt,
  }).select("id").single();
  if (error) throw error;
  createdOrders.push(data.id);
  return { id: data.id as string, token: statusToken };
}

async function stored(id: string) {
  const { data } = await db.from("orders").select("status, transfer_reported_at").eq("id", id).single();
  return {
    status: data!.status as string,
    transferReportedAt: data!.transfer_reported_at ? new Date(data!.transfer_reported_at).toISOString() : null,
  };
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
});

describe("supabaseOrderRepository.reportTransfer", () => {
  test("결제대기·계좌이체 주문은 신고 시각을 기록하고 상태는 결제대기 그대로", async () => {
    const order = await createOrder("pending", "transfer");
    expect(await repo.reportTransfer(order.token, T1)).toEqual({ outcome: "reported", transferReportedAt: T1.toISOString() });
    expect(await stored(order.id)).toEqual({ status: "pending", transferReportedAt: T1.toISOString() });
  });

  test("다시 눌러도 처음 시각을 덮어쓰지 않는다", async () => {
    const order = await createOrder("pending", "transfer");
    await repo.reportTransfer(order.token, T1);
    expect(await repo.reportTransfer(order.token, T2)).toEqual({ outcome: "already_reported", transferReportedAt: T1.toISOString() });
    expect((await stored(order.id)).transferReportedAt).toBe(T1.toISOString());
  });

  test("동시에 두 번 눌러도 시각은 하나만 남고 두 응답이 같은 시각", async () => {
    const order = await createOrder("pending", "transfer");
    const [a, b] = await Promise.all([repo.reportTransfer(order.token, T1), repo.reportTransfer(order.token, T2)]);
    const saved = (await stored(order.id)).transferReportedAt;
    expect([a.outcome, b.outcome].sort()).toEqual(["already_reported", "reported"]);
    expect(a).toMatchObject({ transferReportedAt: saved });
    expect(b).toMatchObject({ transferReportedAt: saved });
  });

  test("현금 주문은 거부하고 아무것도 기록하지 않는다", async () => {
    const order = await createOrder("pending", "cash");
    expect(await repo.reportTransfer(order.token, T1)).toEqual({ outcome: "not_allowed" });
    expect(await stored(order.id)).toEqual({ status: "pending", transferReportedAt: null });
  });

  test.each(["paid", "cooking", "cancelled", "expired"])("결제대기가 아닌(%s) 계좌이체 주문은 거부", async (status) => {
    const order = await createOrder(status, "transfer");
    expect(await repo.reportTransfer(order.token, T1)).toEqual({ outcome: "not_allowed" });
    expect((await stored(order.id)).transferReportedAt).toBeNull();
  });

  test("신고 뒤 입금 확인(결제확인)된 주문에 다시 누르면 거부(버튼이 사라지는 상태)", async () => {
    const order = await createOrder("paid", "transfer", T1.toISOString());
    expect(await repo.reportTransfer(order.token, T2)).toEqual({ outcome: "not_allowed" });
    expect((await stored(order.id)).transferReportedAt).toBe(T1.toISOString());
  });

  test("없는 토큰은 not_found", async () => {
    expect(await repo.reportTransfer(randomBytes(32).toString("hex"), T1)).toEqual({ outcome: "not_found" });
  });
});
