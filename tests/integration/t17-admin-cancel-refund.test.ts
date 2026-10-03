import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { transition, type AdminTransitionInput } from "@/services/adminOrderService";

// T-17 취소·환불(F-18·F-19): 상태 전환 서비스 transition()을 실제 저장소·실제 DB에 연결해 확인한다.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증·요청 검사 같은 Route Handler 경계는
// 단위 테스트(tests/unit/api/adminOrderTransitionRoute.test.ts), 로그인을 포함한 흐름은 T-24 E2E에서 본다.
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

type Status = "pending" | "paid" | "cooking" | "completed";
type Line = { quantity: number };

// 메뉴 2개(재고 10)와 주문 1건(항목 수량은 lines대로)을 만든다. 재고는 주문 시 이미 차감된 상태로 둔다.
async function createOrder(status: Status, paymentMethod: "cash" | "transfer", lines: Line[], createdAt?: string) {
  const menus = await db.from("menu_items")
    .insert(lines.map((line) => ({ base_price: 3000, stock: 10 - line.quantity })))
    .select("id");
  if (menus.error) throw menus.error;
  const menuIds = menus.data.map((menu) => menu.id as string);
  createdMenus.push(...menuIds);

  const total = lines.reduce((sum, line) => sum + 3000 * line.quantity, 0);
  const order = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
    payment_method: paymentMethod,
    total_amount: total,
    idempotency_key: randomUUID(),
    status_token: randomUUID(),
    ...(createdAt ? { created_at: createdAt } : {}),
  }).select("id").single();
  if (order.error) throw order.error;
  const id = order.data.id as string;
  createdOrders.push(id);

  const items = await db.from("order_items").insert(lines.map((line, index) => ({
    order_id: id,
    menu_item_id: menuIds[index],
    menu_name_ko: `테스트 메뉴 ${index + 1}`,
    unit_price: 3000,
    quantity: line.quantity,
    line_total: 3000 * line.quantity,
    sort_order: index,
  })));
  if (items.error) throw items.error;
  return { id, menuIds };
}

// 관리자 한 명이 한 요청. Route Handler가 넘기는 것과 같은 입력으로 서비스를 부른다.
function requestTransition(id: string, body: Omit<AdminTransitionInput, "orderId" | "adminId">) {
  return transition({ orderId: id, adminId, ...body }, { orderRepository });
}

// 거부된 요청이 던진 AppError의 code·HTTP 상태
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, status: (error as AppError).status };
}

async function stocks(menuIds: string[]) {
  const { data, error } = await db.from("menu_items").select("id, stock").in("id", menuIds);
  if (error) throw error;
  return menuIds.map((id) => data.find((menu) => menu.id === id)!.stock as number);
}

async function storedOrder(id: string) {
  const { data, error } = await db.from("orders").select("status, refund_channel, closed_at").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function history(id: string) {
  const { data, error } = await db.from("order_status_history")
    .select("from_status, to_status, action, actor_type, actor_id, reason")
    .eq("order_id", id).order("id");
  if (error) throw error;
  return data;
}

// 요청이 거부됐을 때 주문·재고·이력이 그대로인지
async function expectUnchanged(id: string, menuIds: string[], status: Status, stockBefore: number[]) {
  expect(await storedOrder(id)).toMatchObject({ status, refund_channel: null, closed_at: null });
  expect(await stocks(menuIds)).toEqual(stockBefore);
  expect(await history(id)).toEqual([]);
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("T-17 취소 (결제대기·결제확인)", () => {
  test.each([
    ["pending", "cash"],
    ["paid", "transfer"],
  ] as const)("%s(%s) 주문 취소: 재고를 항목 수량만큼 복구하고 사유·주체 이력을 남긴다", async (status, paymentMethod) => {
    const { id, menuIds } = await createOrder(status, paymentMethod, [{ quantity: 2 }, { quantity: 3 }]);

    const result = await requestTransition(id, { action: "cancel", reason: "  고객 요청  " });

    expect(result).toEqual({ id, status: "cancelled", paymentMethod });
    expect(await stocks(menuIds)).toEqual([10, 10]);
    expect(await storedOrder(id)).toMatchObject({ status: "cancelled", refund_channel: null });
    expect((await storedOrder(id)).closed_at).not.toBeNull();
    expect(await history(id)).toEqual([{
      from_status: status, to_status: "cancelled", action: "cancel",
      actor_type: "admin", actor_id: adminId, reason: "고객 요청",
    }]);
  });
});

describe("T-17 환불 (조리중)", () => {
  test.each([
    ["transfer", "bank"],
    ["cash", "cash"],
  ] as const)("%s 주문 환불: 환불 경로 %s 기록, 재고 복구, 이력", async (paymentMethod, refundChannel) => {
    const { id, menuIds } = await createOrder("cooking", paymentMethod, [{ quantity: 1 }, { quantity: 4 }]);

    const result = await requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel });

    expect(result).toEqual({ id, status: "refunded", paymentMethod });
    expect(await stocks(menuIds)).toEqual([10, 10]);
    expect(await storedOrder(id)).toMatchObject({ status: "refunded", refund_channel: refundChannel });
    expect(await history(id)).toEqual([{
      from_status: "cooking", to_status: "refunded", action: "refund",
      actor_type: "admin", actor_id: adminId, reason: "재료 소진",
    }]);
  });

  test("환불하면 매출에서 빠지고 환불 금액·건수로 집계된다(T-21 get_stats)", async () => {
    // 다른 테스트 주문과 섞이지 않게 먼 미래 날짜(KST)에 둔다.
    const day = `2098-${String(randomInt(1, 13)).padStart(2, "0")}-${String(randomInt(1, 29)).padStart(2, "0")}`;
    const { id } = await createOrder("cooking", "transfer", [{ quantity: 2 }], `${day}T03:00:00Z`);
    const statsOf = async () => {
      const { data, error } = await db.rpc("get_stats", { p_date: day });
      if (error) throw error;
      return data as { sales: number; refundedAmount: number; refundedCount: number; byMenu: unknown[] };
    };
    expect(await statsOf()).toMatchObject({ sales: 6000, refundedAmount: 0, refundedCount: 0 });

    await requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel: "bank" });

    expect(await statsOf()).toMatchObject({ sales: 0, refundedAmount: 6000, refundedCount: 1, byMenu: [] });
  });
});

describe("T-17 거부 — 주문·재고·이력이 바뀌지 않는다", () => {
  // 빈 문자열을 요청 규격(1..200자) 위반 400 VALIDATION_ERROR로 거르는 것은 Route Handler 몫 — 단위 테스트에서 본다.
  test.each([
    ["사유 없음", undefined],
    ["사유 공백", "   "],
    ["사유 빈 문자열", ""],
  ])("취소 %s → 400 REASON_REQUIRED", async (_label, reason) => {
    const { id, menuIds } = await createOrder("pending", "cash", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    expect(await rejection(requestTransition(id, { action: "cancel", reason })))
      .toEqual({ code: "REASON_REQUIRED", status: 400 });
    await expectUnchanged(id, menuIds, "pending", before);
  });

  test("환불 사유 공백 → 400 REASON_REQUIRED", async () => {
    const { id, menuIds } = await createOrder("cooking", "transfer", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    expect(await rejection(requestTransition(id, { action: "refund", reason: " ", refundChannel: "bank" })))
      .toEqual({ code: "REASON_REQUIRED", status: 400 });
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test("환불 경로 없음 → 400 REFUND_CHANNEL_REQUIRED", async () => {
    const { id, menuIds } = await createOrder("cooking", "transfer", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    expect(await rejection(requestTransition(id, { action: "refund", reason: "재료 소진" })))
      .toEqual({ code: "REFUND_CHANNEL_REQUIRED", status: 400 });
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test.each([
    ["cash", "bank"],
    ["transfer", "cash"],
  ] as const)("%s 주문에 결제수단과 다른 환불 경로(%s) → 409 INVALID_TRANSITION", async (paymentMethod, refundChannel) => {
    const { id, menuIds } = await createOrder("cooking", paymentMethod, [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    expect(await rejection(requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel })))
      .toEqual({ code: "INVALID_TRANSITION", status: 409 });
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test.each([
    ["cancel", { action: "cancel", reason: "고객 요청" }],
    ["refund", { action: "refund", reason: "고객 요청", refundChannel: "cash" }],
  ] as const)("완료 주문 %s → 409 INVALID_TRANSITION", async (_label, body) => {
    const { id, menuIds } = await createOrder("completed", "cash", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    expect(await rejection(requestTransition(id, body))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    await expectUnchanged(id, menuIds, "completed", before);
  });
});

describe("T-17 중복 처리", () => {
  test("같은 주문을 동시에 두 번 취소해도 한 번만 반영: 성공 1·409 1, 재고 1회 복구, 이력 1행", async () => {
    const { id, menuIds } = await createOrder("paid", "transfer", [{ quantity: 3 }]);

    const results = await Promise.allSettled([
      requestTransition(id, { action: "cancel", reason: "고객 요청" }),
      requestTransition(id, { action: "cancel", reason: "고객 요청" }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AppError);
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(await stocks(menuIds)).toEqual([10]);
    expect(await history(id)).toHaveLength(1);
  });

  test("이미 환불된 주문을 다시 환불하면 409, 재고는 한 번만 복구", async () => {
    const { id, menuIds } = await createOrder("cooking", "cash", [{ quantity: 2 }]);
    const body = { action: "refund", reason: "재료 소진", refundChannel: "cash" } as const;

    await requestTransition(id, body);

    expect((await rejection(requestTransition(id, body))).status).toBe(409);
    expect(await stocks(menuIds)).toEqual([10]);
    expect(await history(id)).toHaveLength(1);
  });
});
