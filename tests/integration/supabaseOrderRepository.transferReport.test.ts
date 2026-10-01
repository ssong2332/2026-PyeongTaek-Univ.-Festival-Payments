import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { reportTransfer } from "@/services/orderService";

// 송금 신고(T-32, F-43)가 실제 DB에서 상태를 바꾸지 않고 최초 시각만 남기는지 확인한다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

const EARLIER = "2026-10-07T03:00:00.000Z";

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

describe("supabaseOrderRepository.setTransferReported", () => {
  test("결제대기·계좌이체·미신고 주문은 지금 시각을 기록해 돌려주고 상태는 결제대기 그대로", async () => {
    const order = await createOrder("pending", "transfer");
    const before = Date.now();
    const at = await repo.setTransferReported(order.id);
    expect(at).not.toBeNull();
    expect(new Date(at!).getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(await stored(order.id)).toEqual({ status: "pending", transferReportedAt: new Date(at!).toISOString() });
  });

  test("이미 신고된 주문은 덮어쓰지 않고 null", async () => {
    const order = await createOrder("pending", "transfer", EARLIER);
    expect(await repo.setTransferReported(order.id)).toBeNull();
    expect((await stored(order.id)).transferReportedAt).toBe(EARLIER);
  });

  test("현금 주문은 기록하지 않고 null", async () => {
    const order = await createOrder("pending", "cash");
    expect(await repo.setTransferReported(order.id)).toBeNull();
    expect(await stored(order.id)).toEqual({ status: "pending", transferReportedAt: null });
  });

  test.each(["paid", "cooking", "cancelled", "expired"])("결제대기가 아닌(%s) 계좌이체 주문은 기록하지 않고 null", async (status) => {
    const order = await createOrder(status, "transfer");
    expect(await repo.setTransferReported(order.id)).toBeNull();
    expect((await stored(order.id)).transferReportedAt).toBeNull();
  });
});

describe("orderService.reportTransfer (실제 DB)", () => {
  const deps = { orderRepository: repo };

  test("다시 눌러도 처음 시각을 덮어쓰지 않는다", async () => {
    const order = await createOrder("pending", "transfer");
    const first = await reportTransfer(order.token, deps);
    const second = await reportTransfer(order.token, deps);
    expect(second).toEqual(first);
    expect(await stored(order.id)).toEqual({ status: "pending", transferReportedAt: first.transferReportedAt });
  });

  test("동시에 두 번 눌러도 시각은 하나만 남고 두 응답이 같은 시각", async () => {
    const order = await createOrder("pending", "transfer");
    const [a, b] = await Promise.all([reportTransfer(order.token, deps), reportTransfer(order.token, deps)]);
    const saved = (await stored(order.id)).transferReportedAt;
    expect(a).toEqual({ transferReportedAt: saved });
    expect(b).toEqual({ transferReportedAt: saved });
  });

  test("신고 뒤 입금 확인(결제확인)된 주문에 다시 누르면 409(버튼이 사라지는 상태)", async () => {
    const order = await createOrder("paid", "transfer", EARLIER);
    const error = await reportTransfer(order.token, deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    expect((await stored(order.id)).transferReportedAt).toBe(EARLIER);
  });

  test("없는 토큰은 404", async () => {
    const error = await reportTransfer(randomBytes(32).toString("hex"), deps).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
