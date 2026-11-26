import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { resolveCancelRequest, transition } from "@/services/adminOrderService";
import { getOrderByToken, reportTransfer, requestCancel } from "@/services/orderService";

// T-55(DECISIONS #65, #155 2026-11-11 팀장 결정): 관리자 서비스 → 실제 저장소 → 0107 되돌리기 함수.
// 취소 거절 → 입금 확인 → 되돌리기 → 고객 재요청 → 승인/거절 흐름과, 되돌리기 전후 고객 응답의 canCancelRequest를 본다.
// 동작을 바꾸는 mock은 쓰지 않는다(DECISIONS #46). 0107 함수 자체(권한·경계값·만료 등)는 DB1의 t55-pending-cycle 테스트 범위.
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const deps = { orderRepository, adminOrderRepository };
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

const QUANTITY = 2;
const STOCK_AFTER_ORDER = 8;

async function createOrder(paymentMethod: "cash" | "transfer" = "transfer") {
  const menu = await db.from("menu_items").insert({ base_price: 3000, stock: STOCK_AFTER_ORDER }).select("id").single();
  if (menu.error) throw menu.error;
  const menuId = menu.data.id as string;
  createdMenus.push(menuId);

  const token = randomBytes(32).toString("hex");
  const order = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status: "pending",
    payment_method: paymentMethod,
    total_amount: 3000 * QUANTITY,
    idempotency_key: randomUUID(),
    status_token: token,
  }).select("id").single();
  if (order.error) throw order.error;
  const id = order.data.id as string;
  createdOrders.push(id);

  const items = await db.from("order_items").insert({
    order_id: id, menu_item_id: menuId, menu_name_ko: "테스트 메뉴",
    unit_price: 3000, quantity: QUANTITY, line_total: 3000 * QUANTITY, sort_order: 0,
  });
  if (items.error) throw items.error;
  return { id, token, menuId };
}

async function stored(id: string) {
  const { data, error } = await db.from("orders")
    .select("status, pending_since, paid_at, cooking_started_at, cancel_requested_at, cancel_rejected_at, transfer_reported_at, transfer_reported_history")
    .eq("id", id).single();
  if (error) throw error;
  return data as {
    status: string; pending_since: string | null; paid_at: string | null; cooking_started_at: string | null;
    cancel_requested_at: string | null; cancel_rejected_at: string | null;
    transfer_reported_at: string | null; transfer_reported_history: string[] | null;
  };
}

async function stock(menuId: string) {
  const { data, error } = await db.from("menu_items").select("stock").eq("id", menuId).single();
  if (error) throw error;
  return data.stock as number;
}

async function actions(id: string) {
  const { data, error } = await db.from("order_status_history").select("action, reason").eq("order_id", id).order("id");
  if (error) throw error;
  return data as { action: string; reason: string | null }[];
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, status: (error as AppError).status };
}

const confirm = (id: string) => transition({ orderId: id, action: "confirm_payment", adminId }, { orderRepository });
const revert = (id: string, reason = "잘못 확인") =>
  transition({ orderId: id, action: "revert_to_pending", adminId, reason }, { orderRepository });

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("T-55 되돌리기 — 관리자 서비스 경로", () => {
  test("입금 확인 뒤 되돌리기: 결제대기·새 대기 시작 시각·결제/조리 시각 정리·재고 그대로·이력 사유", async () => {
    const order = await createOrder();
    await confirm(order.id);

    const result = await revert(order.id, "  입금 금액 다름 ");

    expect(result.status).toBe("pending");
    const after = await stored(order.id);
    expect(after).toMatchObject({ status: "pending", paid_at: null, cooking_started_at: null });
    expect(after.pending_since).not.toBeNull();
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER);
    expect(await actions(order.id)).toEqual([
      { action: "confirm_payment", reason: null },
      { action: "revert_to_pending", reason: "입금 금액 다름" },
    ]);
  });

  test("되돌린 뒤 다시 입금 확인하면 0106 보호 함수를 거쳐 조리중", async () => {
    const order = await createOrder();
    await confirm(order.id);
    await revert(order.id);

    expect((await confirm(order.id)).status).toBe("cooking");
    expect((await actions(order.id)).map((row) => row.action)).toEqual(["confirm_payment", "revert_to_pending", "confirm_payment"]);
  });

  // #170 QA 권고(2026-11-25): DB 함수 직접 호출이 아니라 실제 앱 경로(confirm_payment → 0106 보호 함수)로
  // 입금 재확인 → 조리중 → 다시 되돌리기를 검증한다.
  test("송금 신고 → 입금 확인 → 되돌리기 → 재신고 → 입금 재확인 → 다시 되돌리기: 주기마다 신고 이력 누적, 재고 그대로", async () => {
    const order = await createOrder();
    const firstReport = (await reportTransfer(order.token, deps)).transferReportedAt;
    await confirm(order.id);
    await revert(order.id, "첫 번째 실수");
    const firstCycle = await stored(order.id);

    const secondReport = (await reportTransfer(order.token, deps)).transferReportedAt;
    expect((await confirm(order.id)).status).toBe("cooking");
    expect((await revert(order.id, "두 번째 실수")).status).toBe("pending");

    const after = await stored(order.id);
    expect(after).toMatchObject({ status: "pending", paid_at: null, cooking_started_at: null, transfer_reported_at: null });
    expect(Date.parse(after.pending_since!)).toBeGreaterThanOrEqual(Date.parse(firstCycle.pending_since!));
    expect((after.transfer_reported_history ?? []).map(Date.parse)).toEqual([Date.parse(firstReport), Date.parse(secondReport)]);
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER);
    expect(await actions(order.id)).toEqual([
      { action: "confirm_payment", reason: null },
      { action: "revert_to_pending", reason: "첫 번째 실수" },
      { action: "confirm_payment", reason: null },
      { action: "revert_to_pending", reason: "두 번째 실수" },
    ]);
  });

  test("현금 주문은 되돌릴 수 없다 — 409 INVALID_TRANSITION, 상태 그대로", async () => {
    const order = await createOrder("cash");
    await transition({ orderId: order.id, action: "confirm_cash", adminId }, { orderRepository });

    expect(await rejection(revert(order.id))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect((await stored(order.id)).status).toBe("cooking");
  });

  test("사유가 공백뿐이면 400 REASON_REQUIRED, 상태 그대로", async () => {
    const order = await createOrder();
    await confirm(order.id);

    expect(await rejection(revert(order.id, "   "))).toEqual({ code: "REASON_REQUIRED", status: 400 });
    expect((await stored(order.id)).status).toBe("cooking");
  });

  test("관리자 2명이 동시에 되돌리면 한쪽만 성공, 이력 1행", async () => {
    const order = await createOrder();
    await confirm(order.id);

    const results = await Promise.allSettled([revert(order.id, "관리자 A"), revert(order.id, "관리자 B")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(AppError);
    expect((failed.reason as AppError).status).toBe(409);
    expect((await actions(order.id)).filter((row) => row.action === "revert_to_pending")).toHaveLength(1);
  });
});

// #155 팀장 결정(2026-11-11, 방법 나): 되돌리면 취소 요청·거절 시각이 비워져 새 주기에서 다시 요청할 수 있다. 과거 거절 이력은 남는다.
describe("T-55 × T-35 — 거절 → 입금 확인 → 되돌리기 → 고객 재요청", () => {
  async function rejectedThenRevert() {
    const order = await createOrder();
    await requestCancel(order.token, deps);
    await resolveCancelRequest({ orderId: order.id, decision: "reject", reason: "입금 확인됨", adminId }, deps);
    await confirm(order.id);
    const beforeRevert = await getOrderByToken(order.token, deps);
    await revert(order.id);
    const afterRevert = await getOrderByToken(order.token, deps);
    return { order, beforeRevert, afterRevert };
  }

  test("되돌리기 전에는 canCancelRequest=false, 되돌린 뒤에는 true", async () => {
    const { order, beforeRevert, afterRevert } = await rejectedThenRevert();

    expect(beforeRevert).toMatchObject({ status: "cooking", canCancelRequest: false });
    expect(afterRevert).toMatchObject({ status: "pending", canCancelRequest: true, cancelRequestedAt: null, cancelRejectedAt: null });
    // 과거 거절 기록은 이력에 그대로 남는다
    expect((await actions(order.id)).map((row) => row.action)).toEqual(
      ["cancel_request_reject", "confirm_payment", "revert_to_pending"],
    );
  });

  test("새 주기 재요청 → 승인: 취소·재고 복구", async () => {
    const { order } = await rejectedThenRevert();

    const { cancelRequestedAt } = await requestCancel(order.token, deps);
    expect(cancelRequestedAt).not.toBeNull();
    // 요청이 걸린 동안은 T-54 차단으로 입금 확인 불가
    expect(await rejection(confirm(order.id))).toEqual({ code: "INVALID_TRANSITION", status: 409 });

    await resolveCancelRequest({ orderId: order.id, decision: "approve", reason: "고객 요청", adminId }, deps);
    expect((await stored(order.id)).status).toBe("cancelled");
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER + QUANTITY);
  });

  test("새 주기 재요청 → 거절: 결제대기 유지, 같은 주기에서는 다시 요청할 수 없고 입금 확인은 가능", async () => {
    const { order } = await rejectedThenRevert();

    await requestCancel(order.token, deps);
    await resolveCancelRequest({ orderId: order.id, decision: "reject", reason: "입금 확인됨", adminId }, deps);

    expect(await getOrderByToken(order.token, deps)).toMatchObject({ status: "pending", canCancelRequest: false });
    expect(await rejection(requestCancel(order.token, deps))).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
    expect((await confirm(order.id)).status).toBe("cooking");
    expect((await actions(order.id)).filter((row) => row.action === "cancel_request_reject")).toHaveLength(2);
  });
});
