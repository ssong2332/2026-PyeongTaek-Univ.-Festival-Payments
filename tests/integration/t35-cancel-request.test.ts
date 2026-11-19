import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { resolveCancelRequest, transition } from "@/services/adminOrderService";
import { requestCancel } from "@/services/orderService";

// T-35 고객 취소 요청(F-45)과 관리자 승인·거절(F-18)을 서비스 → 실제 저장소 → 실제 DB로 확인한다.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증·요청 검사 같은 Route Handler 경계는
// 단위 테스트(tests/unit/api/*CancelRequestRoute.test.ts), 이력 추가 실패 시 되돌리기는 저장소 단위 테스트에서 본다.
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const deps = { orderRepository, adminOrderRepository };
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

const EARLIER = "2026-10-07T03:00:00.000Z";
const QUANTITY = 2;

type Marks = { requestedAt?: string | null; rejectedAt?: string | null; paymentMethod?: "cash" | "transfer" };

// 메뉴 1개(재고 10)와 수량 2인 주문 1건을 만든다. 재고는 주문 시 이미 차감된 상태(8)로 둔다.
async function createOrder(status: string, marks: Marks = {}) {
  const menu = await db.from("menu_items").insert({ base_price: 3000, stock: 10 - QUANTITY }).select("id").single();
  if (menu.error) throw menu.error;
  const menuId = menu.data.id as string;
  createdMenus.push(menuId);

  const token = randomBytes(32).toString("hex");
  const order = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
    payment_method: marks.paymentMethod ?? "transfer",
    total_amount: 3000 * QUANTITY,
    idempotency_key: randomUUID(),
    status_token: token,
    cancel_requested_at: marks.requestedAt ?? null,
    cancel_rejected_at: marks.rejectedAt ?? null,
  }).select("id").single();
  if (order.error) throw order.error;
  const id = order.data.id as string;
  createdOrders.push(id);

  const items = await db.from("order_items").insert({
    order_id: id,
    menu_item_id: menuId,
    menu_name_ko: "테스트 메뉴",
    unit_price: 3000,
    quantity: QUANTITY,
    line_total: 3000 * QUANTITY,
    sort_order: 0,
  });
  if (items.error) throw items.error;
  return { id, token, menuId };
}

const iso = (value: string | null) => (value ? new Date(value).toISOString() : null);

async function stored(id: string) {
  const { data, error } = await db.from("orders")
    .select("status, cancel_requested_at, cancel_rejected_at, closed_at").eq("id", id).single();
  if (error) throw error;
  return {
    status: data.status as string,
    requestedAt: iso(data.cancel_requested_at),
    rejectedAt: iso(data.cancel_rejected_at),
    closedAt: iso(data.closed_at),
  };
}

async function stock(menuId: string) {
  const { data, error } = await db.from("menu_items").select("stock").eq("id", menuId).single();
  if (error) throw error;
  return data.stock as number;
}

async function history(id: string) {
  const { data, error } = await db.from("order_status_history")
    .select("from_status, to_status, action, actor_type, actor_id, reason")
    .eq("order_id", id).order("id");
  if (error) throw error;
  return data;
}

// 거부된 요청이 던진 AppError의 code·HTTP 상태
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, status: (error as AppError).status };
}

function resolve(id: string, decision: "approve" | "reject", reason = "사유") {
  return resolveCancelRequest({ orderId: id, decision, reason, adminId }, deps);
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("T-35 고객 취소 요청 (requestCancel)", () => {
  test.each(["pending", "paid"])("%s 주문: 요청 시각만 기록하고 상태·재고·이력은 그대로", async (status) => {
    const order = await createOrder(status);
    const before = Date.now();

    const { cancelRequestedAt } = await requestCancel(order.token, deps);

    expect(new Date(cancelRequestedAt).getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(await stored(order.id)).toEqual({ status, requestedAt: cancelRequestedAt, rejectedAt: null, closedAt: null });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test("다시 눌러도 처음 시각을 덮어쓰지 않는다", async () => {
    const order = await createOrder("paid");
    const first = await requestCancel(order.token, deps);
    const second = await requestCancel(order.token, deps);
    expect(second).toEqual(first);
    expect((await stored(order.id)).requestedAt).toBe(first.cancelRequestedAt);
  });

  test("동시에 5번 눌러도 시각은 하나이고 모든 응답이 같다", async () => {
    const order = await createOrder("pending");
    const results = await Promise.all(Array.from({ length: 5 }, () => requestCancel(order.token, deps)));
    expect(new Set(results.map((r) => r.cancelRequestedAt)).size).toBe(1);
    expect((await stored(order.id)).requestedAt).toBe(results[0].cancelRequestedAt);
  });

  test.each(["cooking", "completed", "cancelled", "refunded", "expired"])(
    "%s 주문은 409 CANCEL_REQUEST_NOT_ALLOWED, 요청 시각 저장 0건",
    async (status) => {
      const order = await createOrder(status);
      expect(await rejection(requestCancel(order.token, deps))).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
      expect((await stored(order.id)).requestedAt).toBeNull();
    },
  );

  test("거절된 주문은 다시 요청할 수 없다(409), 기록은 그대로", async () => {
    const order = await createOrder("paid", { requestedAt: EARLIER, rejectedAt: EARLIER });
    expect(await rejection(requestCancel(order.token, deps))).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
    expect(await stored(order.id)).toMatchObject({ requestedAt: EARLIER, rejectedAt: EARLIER });
  });

  test("요청 뒤 조리가 시작된 주문은 409 (기존 시각을 성공으로 돌려주지 않는다)", async () => {
    const order = await createOrder("cooking", { requestedAt: EARLIER });
    expect(await rejection(requestCancel(order.token, deps))).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
  });

  test("없는 토큰은 404 NOT_FOUND", async () => {
    expect(await rejection(requestCancel(randomBytes(32).toString("hex"), deps))).toEqual({ code: "NOT_FOUND", status: 404 });
  });

  test("저장소 setCancelRequested: 조건이 안 맞으면 기록하지 않고 null", async () => {
    const cooking = await createOrder("cooking");
    const requested = await createOrder("paid", { requestedAt: EARLIER });
    expect(await orderRepository.setCancelRequested(cooking.id)).toBeNull();
    expect(await orderRepository.setCancelRequested(requested.id)).toBeNull();
    expect((await stored(requested.id)).requestedAt).toBe(EARLIER);
  });
});

describe("T-35 관리자 승인 (resolveCancelRequest approve)", () => {
  test.each(["pending", "paid"])("%s 주문 승인: 취소 + 재고 복구 + 사유·주체 이력(action cancel)", async (status) => {
    const order = await createOrder(status, { requestedAt: EARLIER });

    const result = await resolve(order.id, "approve", "  고객 요청  ");

    expect(result).toMatchObject({ id: order.id, status: "cancelled", lastReason: "고객 요청", availableActions: [] });
    expect(await stock(order.menuId)).toBe(10);
    const after = await stored(order.id);
    expect(after).toMatchObject({ status: "cancelled", requestedAt: EARLIER, rejectedAt: null });
    expect(after.closedAt).not.toBeNull();
    expect(await history(order.id)).toEqual([{
      from_status: status, to_status: "cancelled", action: "cancel",
      actor_type: "admin", actor_id: adminId, reason: "고객 요청",
    }]);
  });
});

describe("T-35 관리자 거절 (resolveCancelRequest reject)", () => {
  test.each(["pending", "paid"])("%s 주문 거절: 상태·재고 유지 + 거절 시각 + 이력(action cancel_request_reject)", async (status) => {
    const order = await createOrder(status, { requestedAt: EARLIER });
    const before = Date.now();

    const result = await resolve(order.id, "reject", "  이미 조리 준비 중  ");

    expect(result).toMatchObject({ id: order.id, status, lastReason: "이미 조리 준비 중" });
    expect(result.cancelRejectedAt).not.toBeNull();
    const after = await stored(order.id);
    expect(after).toMatchObject({ status, requestedAt: EARLIER, closedAt: null });
    expect(new Date(after.rejectedAt!).getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([{
      from_status: status, to_status: status, action: "cancel_request_reject",
      actor_type: "admin", actor_id: adminId, reason: "이미 조리 준비 중",
    }]);
  });

  test("거절 뒤 고객 상태 조회는 거절됨이고 다시 요청할 수 없다", async () => {
    const order = await createOrder("paid");
    await requestCancel(order.token, deps);
    await resolve(order.id, "reject");
    expect(await rejection(requestCancel(order.token, deps))).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
  });

  test("두 관리자가 동시에 거절해도 한 번만 기록된다(나머지는 409 INVALID_TRANSITION)", async () => {
    const order = await createOrder("paid", { requestedAt: EARLIER });
    const results = await Promise.allSettled([resolve(order.id, "reject"), resolve(order.id, "reject"), resolve(order.id, "reject")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "INVALID_TRANSITION", status: 409 });
    }
    expect(await history(order.id)).toHaveLength(1);
  });
});

describe("T-35 승인·거절 거부", () => {
  test.each(["approve", "reject"] as const)("취소 요청이 없는 주문 %s → 409 INVALID_TRANSITION, 변화 없음", async (decision) => {
    const order = await createOrder("paid");
    expect(await rejection(resolve(order.id, decision))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await stored(order.id)).toEqual({ status: "paid", requestedAt: null, rejectedAt: null, closedAt: null });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test.each(["approve", "reject"] as const)("이미 거절된 요청 %s → 409 INVALID_TRANSITION, 변화 없음", async (decision) => {
    const order = await createOrder("paid", { requestedAt: EARLIER, rejectedAt: EARLIER });
    expect(await rejection(resolve(order.id, decision))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await stored(order.id)).toEqual({ status: "paid", requestedAt: EARLIER, rejectedAt: EARLIER, closedAt: null });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test.each(["approve", "reject"] as const)("요청 뒤 조리가 시작된 주문 %s → 409 INVALID_TRANSITION", async (decision) => {
    const order = await createOrder("cooking", { requestedAt: EARLIER });
    expect(await rejection(resolve(order.id, decision))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await stored(order.id)).toMatchObject({ status: "cooking", rejectedAt: null });
    expect(await history(order.id)).toEqual([]);
  });

  test.each(["approve", "reject"] as const)("사유가 공백뿐인 %s → 400 REASON_REQUIRED, 변화 없음", async (decision) => {
    const order = await createOrder("paid", { requestedAt: EARLIER });
    expect(await rejection(resolve(order.id, decision, "   "))).toEqual({ code: "REASON_REQUIRED", status: 400 });
    expect(await stored(order.id)).toMatchObject({ status: "paid", rejectedAt: null });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test("없는 주문 → 404 NOT_FOUND", async () => {
    expect(await rejection(resolve(randomUUID(), "reject"))).toEqual({ code: "NOT_FOUND", status: 404 });
  });

  test("저장소 rejectCancelRequest: 조건이 안 맞으면 false, 이력 없음", async () => {
    const order = await createOrder("paid");
    expect(await orderRepository.rejectCancelRequest(order.id, adminId, "사유")).toBe(false);
    expect(await history(order.id)).toEqual([]);
  });
});

// T-54(DECISIONS #64·#71): 취소 요청이 대기 중이면 조리중으로 들어가는 동작 3개를 서버가 막고, 먼저 승인/거절하게 한다.
describe("T-54 × T-35 취소 요청 대기 중 조리중 진입 차단", () => {
  const blocked = [
    { action: "confirm_payment", status: "pending", paymentMethod: "transfer" },
    { action: "confirm_cash", status: "pending", paymentMethod: "cash" },
    { action: "start_cooking", status: "paid", paymentMethod: "transfer" },
  ] as const;

  test.each(blocked)("대기 중이면 $action → 409 INVALID_TRANSITION, 상태·재고·이력·요청 시각 불변", async ({ action, status, paymentMethod }) => {
    const order = await createOrder(status, { requestedAt: EARLIER, paymentMethod });

    expect(await rejection(transition({ orderId: order.id, action, adminId }, { orderRepository })))
      .toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await stored(order.id)).toEqual({ status, requestedAt: EARLIER, rejectedAt: null, closedAt: null });
    expect(await stock(order.menuId)).toBe(10 - QUANTITY);
    expect(await history(order.id)).toEqual([]);
  });

  test.each(blocked)("거절 뒤에는 $action 으로 조리중이 된다", async ({ action, status, paymentMethod }) => {
    const order = await createOrder(status, { requestedAt: EARLIER, paymentMethod });
    await resolve(order.id, "reject", "조리 진행");

    const result = await transition({ orderId: order.id, action, adminId }, { orderRepository });
    expect(result.status).toBe("cooking");
    expect((await history(order.id)).map((row) => row.action)).toEqual(["cancel_request_reject", action]);
  });

  test("대기 중이어도 승인(취소)은 그대로 된다 — 재고 복구", async () => {
    const order = await createOrder("pending", { requestedAt: EARLIER });
    await resolve(order.id, "approve", "고객 요청");
    expect((await stored(order.id)).status).toBe("cancelled");
    expect(await stock(order.menuId)).toBe(10);
  });
});
