import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { CreateOrderRequest } from "@/lib/dto/order";

// T-07·T-08 완료 기준을 create_order(0010, DB1) 계약(ADR-0002, PRD F-06~F-10)대로 미리 쓴 통합 테스트.
// 함수가 아직 없으면(PostgREST PGRST202) 파일 전체를 건너뛴다 — 함수가 들어오면 그대로 돈다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);

const probe = await db.rpc("create_order", {
  p_idempotency_key: randomUUID(), p_payment_method: "cash", p_locale: "ko", p_items: [],
});
const hasCreateOrder = probe.error?.code !== "PGRST202";

const createdKeys: string[] = [];
const createdMenus: string[] = [];

type MenuOptions = { stock: number; price?: number; soldOut?: boolean; optionExtra?: number };

async function createMenu({ stock, price = 3000, soldOut = false, optionExtra }: MenuOptions) {
  const { data: menu, error } = await db.from("menu_items")
    .insert({ base_price: price, stock, is_sold_out_manual: soldOut }).select("id").single();
  if (error) throw error;
  createdMenus.push(menu.id);
  await db.from("menu_item_translations").insert({ menu_item_id: menu.id, locale: "ko", name: "호떡" });
  if (optionExtra === undefined) return { menuId: menu.id as string, optionId: undefined };

  const { data: group } = await db.from("option_groups")
    .insert({ menu_item_id: menu.id, min_select: 0, max_select: 1 }).select("id").single();
  await db.from("option_group_translations").insert({ option_group_id: group!.id, locale: "ko", name: "토핑" });
  const { data: option } = await db.from("options")
    .insert({ option_group_id: group!.id, extra_price: optionExtra }).select("id").single();
  await db.from("option_translations").insert({ option_id: option!.id, locale: "ko", name: "치즈" });
  return { menuId: menu.id as string, optionId: option!.id as string };
}

function request(items: CreateOrderRequest["items"], key = randomUUID()): CreateOrderRequest {
  createdKeys.push(key);
  return { idempotencyKey: key, paymentMethod: "cash", locale: "ko", items };
}

async function stockOf(menuId: string) {
  const { data } = await db.from("menu_items").select("stock").eq("id", menuId).single();
  return data!.stock as number;
}

async function ordersWithKey(key: string) {
  const { data } = await db.from("orders").select("id").eq("idempotency_key", key);
  return data ?? [];
}

async function setPickupCounter(value: number) {
  await db.from("counters").upsert({ key: "pickup_number", value });
}

async function pickupCounter() {
  const { data } = await db.from("counters").select("value").eq("key", "pickup_number").single();
  return Number(data!.value);
}

afterEach(async () => {
  if (createdKeys.length) await db.from("orders").delete().in("idempotency_key", createdKeys.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe.skipIf(!hasCreateOrder)("create_order — T-07 주문 생성", () => {
  test("가격은 서버가 계산한다: (기본가 + 옵션 추가 가격) × 수량, 재고 차감", async () => {
    const { menuId, optionId } = await createMenu({ stock: 5, price: 3000, optionExtra: 500 });
    const result = await repo.createOrder(request([{ menuItemId: menuId, quantity: 2, optionIds: [optionId!] }]));

    expect(result).toMatchObject({ status: "pending", totalAmount: 7000, created: true });
    expect(await stockOf(menuId)).toBe(3);
    const { data: items } = await db.from("order_items").select("unit_price, options_price, quantity, line_total").eq("order_id", result.orderId);
    expect(items).toEqual([{ unit_price: 3000, options_price: 500, quantity: 2, line_total: 7000 }]);
  });

  test("재고 1개에 동시 주문 2건 → 1건만 성공, 재고는 음수가 되지 않는다", async () => {
    const { menuId } = await createMenu({ stock: 1 });
    const results = await Promise.allSettled([
      repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }])),
      repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }])),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "OUT_OF_STOCK", status: 409 });
    expect(await stockOf(menuId)).toBe(0);
  });

  test("한 항목이라도 재고가 부족하면 전부 롤백: 주문·재고·픽업 번호 모두 그대로", async () => {
    const ok = await createMenu({ stock: 5 });
    const empty = await createMenu({ stock: 0 });
    const before = await pickupCounter();
    const dto = request([
      { menuItemId: ok.menuId, quantity: 2, optionIds: [] },
      { menuItemId: empty.menuId, quantity: 1, optionIds: [] },
    ]);

    const error = await repo.createOrder(dto).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 409 });
    expect(await ordersWithKey(dto.idempotencyKey)).toHaveLength(0);
    expect(await stockOf(ok.menuId)).toBe(5);
    expect(await pickupCounter()).toBe(before);
  });

  test("품절 표시 메뉴는 409 MENU_UNAVAILABLE", async () => {
    const { menuId } = await createMenu({ stock: 5, soldOut: true });
    const error = await repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }])).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "MENU_UNAVAILABLE", status: 409 });
  });

  test("다른 메뉴의 옵션이면 409 INVALID_OPTION", async () => {
    const a = await createMenu({ stock: 5 });
    const b = await createMenu({ stock: 5, optionExtra: 500 });
    const error = await repo.createOrder(request([{ menuItemId: a.menuId, quantity: 1, optionIds: [b.optionId!] }])).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "INVALID_OPTION", status: 409 });
  });

  test("생성 이력 1행: (없음) → pending, action create, 주체 customer", async () => {
    const { menuId } = await createMenu({ stock: 5 });
    const result = await repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]));
    const { data } = await db.from("order_status_history").select("from_status, to_status, action, actor_type").eq("order_id", result.orderId);
    expect(data).toEqual([{ from_status: null, to_status: "pending", action: "create", actor_type: "customer" }]);
  });
});

describe.skipIf(!hasCreateOrder)("create_order — T-08 멱등키·픽업 번호·토큰", () => {
  test("같은 멱등키 2회 → 주문 1건, 같은 주문 ID·픽업 번호·토큰, 재고 1회 차감", async () => {
    const { menuId } = await createMenu({ stock: 5 });
    const dto = request([{ menuItemId: menuId, quantity: 2, optionIds: [] }]);

    const first = await repo.createOrder(dto);
    const second = await repo.createOrder(dto);

    expect(first.created).toBe(true);
    expect(second).toEqual({ ...first, created: false });
    expect(await ordersWithKey(dto.idempotencyKey)).toHaveLength(1);
    expect(await stockOf(menuId)).toBe(3);
  });

  test("같은 멱등키 동시 2회 → 주문 1건, 재고 1회 차감, 같은 픽업 번호", async () => {
    const { menuId } = await createMenu({ stock: 5 });
    const dto = request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]);

    const [a, b] = await Promise.all([repo.createOrder(dto), repo.createOrder(dto)]);

    expect(a.orderId).toBe(b.orderId);
    expect(a.pickupNumber).toBe(b.pickupNumber);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await stockOf(menuId)).toBe(4);
  });

  test("픽업 번호는 날짜와 상관없이 이어진다 (150 → 151 → 152)", async () => {
    const { menuId } = await createMenu({ stock: 5 });
    await setPickupCounter(150);
    const first = await repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]));
    const second = await repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]));
    expect([first.pickupNumber, second.pickupNumber]).toEqual([151, 152]);
  });

  test("동시 생성 5건 → 픽업 번호 중복 없이 연속", async () => {
    const { menuId } = await createMenu({ stock: 10 });
    await setPickupCounter(0);
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]))));
    expect(results.map((r) => r.pickupNumber).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });

  test("상태 토큰은 64자 16진수이고 주문마다 다르다", async () => {
    const { menuId } = await createMenu({ stock: 10 });
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      repo.createOrder(request([{ menuItemId: menuId, quantity: 1, optionIds: [] }]))));
    for (const r of results) expect(r.statusToken).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(results.map((r) => r.statusToken)).size).toBe(5);
  });
});
