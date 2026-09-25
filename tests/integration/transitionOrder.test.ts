import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

// DB 함수 transition_order는 CAS·터미널 불변·재고 복구·이력만 강제한다.
// 어떤 상태 쌍이 허용인지는 TS 상태 머신이 판단하므로 여기서는 검사하지 않는다(DECISIONS #8).
// 현금 주문만 쓴다: T-53 전후로 계좌이체 주문의 컬럼 조건(transfer_method)이 달라지기 때문.

const db = createServiceClient();
const ADMIN_ID = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

type TransitionArgs = {
  p_order_id: string;
  p_from: string;
  p_to: string;
  p_action: string;
  p_actor_type?: string;
  p_actor_id?: string | null;
  p_reason?: string | null;
  p_refund_channel?: string | null;
};

function transition(args: TransitionArgs, client = db) {
  return client.rpc("transition_order", {
    p_actor_type: "admin", p_actor_id: ADMIN_ID, p_reason: null, p_refund_channel: null, ...args,
  });
}

async function createMenu(stock: number) {
  const { data, error } = await db.from("menu_items").insert({ base_price: 3000, stock }).select("id").single();
  if (error) throw error;
  createdMenus.push(data.id);
  return data.id as string;
}

async function createOrder(status: string, items: { menuItemId: string; quantity: number }[] = []) {
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
  if (items.length > 0) {
    const { error: itemError } = await db.from("order_items").insert(items.map((item) => ({
      order_id: data.id, menu_item_id: item.menuItemId, menu_name_ko: "떡볶이",
      unit_price: 3000, quantity: item.quantity, line_total: 3000 * item.quantity,
    })));
    if (itemError) throw itemError;
  }
  return data.id as string;
}

async function getOrder(id: string) {
  const { data, error } = await db.from("orders").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function getHistory(orderId: string) {
  const { data, error } = await db.from("order_status_history")
    .select("from_status, to_status, action, actor_type, actor_id, reason").eq("order_id", orderId);
  if (error) throw error;
  return data;
}

async function getStock(menuId: string) {
  const { data, error } = await db.from("menu_items").select("stock").eq("id", menuId).single();
  if (error) throw error;
  return data.stock as number;
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("transition_order", () => {
  test("상태를 바꾸고 갱신된 주문 행을 돌려주며 이력 1행을 남긴다", async () => {
    const orderId = await createOrder("cooking");
    const { data, error } = await transition({ p_order_id: orderId, p_from: "cooking", p_to: "completed", p_action: "complete" });

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: orderId, status: "completed" });
    expect(data.completed_at).not.toBeNull();
    expect(await getHistory(orderId)).toEqual([{
      from_status: "cooking", to_status: "completed", action: "complete",
      actor_type: "admin", actor_id: ADMIN_ID, reason: null,
    }]);
  });

  test("입금 확인(pending → paid)은 paid_at을 기록한다", async () => {
    const orderId = await createOrder("pending");
    await transition({ p_order_id: orderId, p_from: "pending", p_to: "paid", p_action: "confirm_payment" });
    const order = await getOrder(orderId);
    expect(order.paid_at).not.toBeNull();
    expect(order.cooking_started_at).toBeNull();
  });

  test("현금 수령 확인(pending → cooking)은 paid_at과 cooking_started_at을 같은 시각으로 기록한다", async () => {
    const orderId = await createOrder("pending");
    await transition({ p_order_id: orderId, p_from: "pending", p_to: "cooking", p_action: "confirm_cash" });
    const order = await getOrder(orderId);
    expect(order.status).toBe("cooking");
    expect(order.paid_at).not.toBeNull();
    expect(order.paid_at).toBe(order.cooking_started_at);
  });

  test("조리 시작(paid → cooking)은 기존 paid_at을 덮어쓰지 않는다", async () => {
    const orderId = await createOrder("pending");
    await transition({ p_order_id: orderId, p_from: "pending", p_to: "paid", p_action: "confirm_payment" });
    const paidAt = (await getOrder(orderId)).paid_at;
    await transition({ p_order_id: orderId, p_from: "paid", p_to: "cooking", p_action: "start_cooking" });
    const order = await getOrder(orderId);
    expect(order.paid_at).toBe(paidAt);
    expect(order.cooking_started_at).not.toBeNull();
  });

  test("취소는 재고를 복구하고 closed_at과 사유를 기록한다", async () => {
    const menuA = await createMenu(5);
    const menuB = await createMenu(0);
    const orderId = await createOrder("paid", [
      { menuItemId: menuA, quantity: 2 }, { menuItemId: menuB, quantity: 1 }, { menuItemId: menuA, quantity: 1 },
    ]);

    const { error } = await transition({ p_order_id: orderId, p_from: "paid", p_to: "cancelled", p_action: "cancel", p_reason: "고객 요청" });

    expect(error).toBeNull();
    expect(await getStock(menuA)).toBe(8);
    expect(await getStock(menuB)).toBe(1);
    expect((await getOrder(orderId)).closed_at).not.toBeNull();
    expect((await getHistory(orderId))[0]).toMatchObject({ action: "cancel", reason: "고객 요청" });
  });

  test("환불은 재고 복구와 함께 환불 경로를 저장한다", async () => {
    const menuId = await createMenu(3);
    const orderId = await createOrder("cooking", [{ menuItemId: menuId, quantity: 2 }]);

    await transition({
      p_order_id: orderId, p_from: "cooking", p_to: "refunded", p_action: "refund",
      p_reason: "재료 소진", p_refund_channel: "cash",
    });

    const order = await getOrder(orderId);
    expect(order).toMatchObject({ status: "refunded", refund_channel: "cash" });
    expect(order.closed_at).not.toBeNull();
    expect(await getStock(menuId)).toBe(5);
  });

  test("시스템 만료는 주체 system·actor_id 없이 이력을 남기고 재고를 복구한다", async () => {
    const menuId = await createMenu(0);
    const orderId = await createOrder("pending", [{ menuItemId: menuId, quantity: 4 }]);

    await transition({ p_order_id: orderId, p_from: "pending", p_to: "expired", p_action: "expire", p_actor_type: "system", p_actor_id: null });

    expect(await getStock(menuId)).toBe(4);
    expect(await getHistory(orderId)).toEqual([{
      from_status: "pending", to_status: "expired", action: "expire", actor_type: "system", actor_id: null, reason: null,
    }]);
  });

  test("완료·조리 시작처럼 종료가 아닌 전환은 재고를 바꾸지 않는다", async () => {
    const menuId = await createMenu(3);
    const orderId = await createOrder("paid", [{ menuItemId: menuId, quantity: 2 }]);
    await transition({ p_order_id: orderId, p_from: "paid", p_to: "cooking", p_action: "start_cooking" });
    await transition({ p_order_id: orderId, p_from: "cooking", p_to: "completed", p_action: "complete" });
    expect(await getStock(menuId)).toBe(3);
  });

  test("현재 상태가 p_from과 다르면 STATE_CHANGED, 아무것도 바꾸지 않는다", async () => {
    const menuId = await createMenu(3);
    const orderId = await createOrder("cooking", [{ menuItemId: menuId, quantity: 1 }]);

    const { error } = await transition({ p_order_id: orderId, p_from: "paid", p_to: "cancelled", p_action: "cancel", p_reason: "고객 요청" });

    expect(error?.message).toBe("STATE_CHANGED");
    expect((await getOrder(orderId)).status).toBe("cooking");
    expect(await getStock(menuId)).toBe(3);
    expect(await getHistory(orderId)).toEqual([]);
  });

  test("같은 전환을 두 번 보내면 두 번째는 STATE_CHANGED (재고 이중 복구 없음)", async () => {
    const menuId = await createMenu(0);
    const orderId = await createOrder("pending", [{ menuItemId: menuId, quantity: 2 }]);
    const args = { p_order_id: orderId, p_from: "pending", p_to: "cancelled", p_action: "cancel", p_reason: "고객 요청" };

    const [first, second] = await Promise.all([transition(args), transition(args)]);

    expect([first.error?.message, second.error?.message].sort()).toEqual(["STATE_CHANGED", undefined]);
    expect(await getStock(menuId)).toBe(2);
    expect(await getHistory(orderId)).toHaveLength(1);
  });

  test.each(["completed", "cancelled", "refunded", "expired"])("p_from이 종료 상태(%s)면 TERMINAL_STATE", async (status) => {
    const orderId = await createOrder(status);
    const { error } = await transition({ p_order_id: orderId, p_from: status, p_to: "cancelled", p_action: "cancel", p_reason: "고객 요청" });
    expect(error?.message).toBe("TERMINAL_STATE");
    expect((await getOrder(orderId)).status).toBe(status);
    expect(await getHistory(orderId)).toEqual([]);
  });

  test("없는 주문이면 ORDER_NOT_FOUND", async () => {
    const { error } = await transition({ p_order_id: randomUUID(), p_from: "pending", p_to: "paid", p_action: "confirm_payment" });
    expect(error?.message).toBe("ORDER_NOT_FOUND");
  });

  test("anon 키로는 호출할 수 없다", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const orderId = await createOrder("pending");
    const { error } = await transition({ p_order_id: orderId, p_from: "pending", p_to: "paid", p_action: "confirm_payment" }, anon);
    expect(error?.code).toBe("42501");
    expect((await getOrder(orderId)).status).toBe("pending");
  });
});
