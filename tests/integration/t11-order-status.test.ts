import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/order/status";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError, ERROR_MESSAGES, toErrorResponse } from "@/lib/api/errors";
import { OrderStatusDtoSchema, type CreateOrderRequest } from "@/lib/dto/order";
import { getOrderByToken, getQueueStatus } from "@/services/orderService";

// T-11 대기 수 집계(count_waiting_before, 0017)와 상태 토큰 조회를 실제 로컬 DB로 확인한다.
// 통합 DB에는 다른 파일이 남긴 주문이 있을 수 있으므로 대기 수는 절대값이 아니라 픽스처 삽입 전후 차이로 단언한다.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const deps = { orderRepository: repo };

const orderKeys: string[] = [];
const menuIds: string[] = [];

// 픽스처 쓰기 실패를 조용히 넘기지 않는다.
async function must(query: PromiseLike<{ error: unknown }>) {
  const { error } = await query;
  if (error) throw error;
}

afterEach(async () => {
  // order_items.menu_item_id가 ON DELETE RESTRICT라 주문을 먼저 지운다(항목·옵션·이력은 CASCADE).
  if (orderKeys.length) await must(db.from("orders").delete().in("idempotency_key", orderKeys.splice(0)));
  if (menuIds.length) await must(db.from("menu_items").delete().in("id", menuIds.splice(0)));
});

// 상태·생성 시각을 지정한 주문 행. 대기 수 집계만 보므로 항목은 넣지 않는다.
async function insertOrder(status: OrderStatus, createdAt: string) {
  const idempotencyKey = randomUUID();
  orderKeys.push(idempotencyKey);
  await must(db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
    payment_method: "cash",
    total_amount: 0,
    idempotency_key: idempotencyKey,
    status_token: randomBytes(32).toString("hex"),
    created_at: createdAt,
  }));
}

type Names = { ko: string; en?: string };

async function insertNames(table: string, idColumn: string, id: string, names: Names) {
  const rows = [{ [idColumn]: id, locale: "ko", name: names.ko }];
  if (names.en !== undefined) rows.push({ [idColumn]: id, locale: "en", name: names.en });
  await must(db.from(table).insert(rows));
}

async function createMenu(
  name: Names,
  basePrice: number,
  option?: { group: string; name: Names; extraPrice: number },
): Promise<{ menuId: string; optionIds: string[] }> {
  const { data: menu, error } = await db.from("menu_items")
    .insert({ base_price: basePrice, stock: 10 }).select("id").single();
  if (error) throw error;
  menuIds.push(menu.id);
  await insertNames("menu_item_translations", "menu_item_id", menu.id, name);
  if (!option) return { menuId: menu.id, optionIds: [] };

  const { data: group, error: groupError } = await db.from("option_groups")
    .insert({ menu_item_id: menu.id, min_select: 0, max_select: 1 }).select("id").single();
  if (groupError) throw groupError;
  await insertNames("option_group_translations", "option_group_id", group.id, { ko: option.group });
  const { data: created, error: optionError } = await db.from("options")
    .insert({ option_group_id: group.id, extra_price: option.extraPrice }).select("id").single();
  if (optionError) throw optionError;
  await insertNames("option_translations", "option_id", created.id, option.name);
  return { menuId: menu.id, optionIds: [created.id] };
}

// 실제 주문 생성 경로(저장소 → create_order RPC). 토큰·스냅샷은 DB 함수가 만든다.
async function placeOrder(
  locale: CreateOrderRequest["locale"],
  paymentMethod: CreateOrderRequest["paymentMethod"],
  items: CreateOrderRequest["items"],
) {
  const idempotencyKey = randomUUID();
  orderKeys.push(idempotencyKey);
  return repo.createOrder({ idempotencyKey, paymentMethod, locale, items });
}

describe("T-11 count_waiting_before — 저장소 countWaitingBefore로 호출", () => {
  // 다른 테스트 데이터와 겹치지 않는 먼 미래 시각(t21-get-stats 방식).
  const CUTOFF = "2099-07-01T00:00:00.000000Z";
  const WAITING_DELTA: Record<OrderStatus, number> = {
    pending: 1, paid: 1, cooking: 1,
    completed: 0, cancelled: 0, refunded: 0, expired: 0,
  };

  test.each(ORDER_STATUSES.map((status): [OrderStatus, number] => [status, WAITING_DELTA[status]]))(
    "기준 시각 전에 생성된 %s 주문 1건 → 대기 수 +%i",
    async (status, expected) => {
      const before = await repo.countWaitingBefore(CUTOFF);
      await insertOrder(status, "2099-06-30T23:59:59.000000Z");
      expect(await repo.countWaitingBefore(CUTOFF) - before).toBe(expected);
    },
  );

  // 함수 조건은 created_at < p_created_at — 기준과 같은 시각(내 주문 자신)도 세지 않는다.
  const boundaryCases: [string, number, string][] = [
    ["기준 1µs 전", 1, "2099-06-30T23:59:59.999999Z"],
    ["기준과 같은 시각", 0, CUTOFF],
    ["기준 1µs 뒤", 0, "2099-07-01T00:00:00.000001Z"],
    ["기준 1시간 뒤", 0, "2099-07-01T01:00:00.000000Z"],
  ];

  test.each(boundaryCases)("%s에 생성된 pending 주문 → 대기 수 +%i", async (_when, expected, createdAt) => {
    const before = await repo.countWaitingBefore(CUTOFF);
    await insertOrder("pending", createdAt);
    expect(await repo.countWaitingBefore(CUTOFF) - before).toBe(expected);
  });

  test("기준 시각이 null·생략이면 생성 시각과 무관하게 전체 대기 주문 수 — getQueueStatus(메뉴판)도 같다", async () => {
    const counts = async () => ({
      nullArg: await repo.countWaitingBefore(null),
      omitted: await repo.countWaitingBefore(),
      queue: (await getQueueStatus(deps)).waitingCount,
    });
    const before = await counts();

    // 과거·현재·먼 미래의 대기 주문 3건 + 제외 대상 2건. null을 now()로 해석하면 먼 미래 행이 빠져 2가 된다.
    // pending 행은 먼 미래 시각에만 둔다 — 스윕이 돌아도 만료 대상이 되지 않게.
    await insertOrder("paid", "2000-01-01T00:00:00.000000Z");
    await insertOrder("cooking", new Date().toISOString());
    await insertOrder("pending", "2099-07-02T00:00:00.000000Z");
    await insertOrder("completed", "2000-01-01T00:00:01.000000Z");
    await insertOrder("expired", "2099-07-02T00:00:01.000000Z");

    const after = await counts();
    expect({
      nullArg: after.nullArg - before.nullArg,
      omitted: after.omitted - before.omitted,
      queue: after.queue - before.queue,
    }).toEqual({ nullArg: 3, omitted: 3, queue: 3 });
  });
});

describe("T-11 getOrderByToken — create_order로 만든 실제 주문을 실제 저장소로 조회", () => {
  const NOT_FOUND_RESPONSE = {
    status: 404,
    envelope: { error: { code: "NOT_FOUND", message: ERROR_MESSAGES.NOT_FOUND } },
  };

  async function expectNotFound(token: string, label: string) {
    const error = await getOrderByToken(token, deps).catch((e: unknown) => e);
    expect(error, label).toBeInstanceOf(AppError);
    expect(toErrorResponse(error), label).toEqual(NOT_FOUND_RESPONSE);
  }

  test("status_token으로 주문을 조회한다 — 응답이 OrderStatusDto 계약과 맞다", async () => {
    const menu = await createMenu({ ko: "씨앗호떡", en: "Seed Hotteok" }, 3000,
      { group: "토핑", name: { ko: "치즈", en: "Cheese" }, extraPrice: 500 });
    const created = await placeOrder("ko", "transfer",
      [{ menuItemId: menu.menuId, quantity: 2, optionIds: menu.optionIds }]);

    const order = await getOrderByToken(created.statusToken, deps);

    expect(order).toEqual({
      orderId: created.orderId,
      pickupNumber: created.pickupNumber,
      status: "pending",
      paymentMethod: "transfer",
      totalAmount: 7000,
      items: [{ name: "씨앗호떡", quantity: 2, options: ["치즈"], lineTotal: 7000 }],
      createdAt: expect.any(String),
      transferReportedAt: null,
      cancelRequestedAt: null,
      cancelRejectedAt: null,
      aheadCount: expect.any(Number),
      canTransferReport: true,
      canCancelRequest: true,
    });
    expect(new Date(order.createdAt).toISOString()).toBe(created.createdAt);
    expect(OrderStatusDtoSchema.safeParse(order).error).toBeUndefined();
  });

  test("aheadCount는 실제 created_at 기준 — 먼저 생성된 대기 주문만 세고 자기 자신은 세지 않는다", async () => {
    const menu = await createMenu({ ko: "꿀호떡" }, 2000);
    const items = [{ menuItemId: menu.menuId, quantity: 1, optionIds: [] }];
    const first = await placeOrder("ko", "cash", items);
    const second = await placeOrder("ko", "cash", items);
    const aheadOf = async (token: string) => (await getOrderByToken(token, deps)).aheadCount;

    const firstAhead = await aheadOf(first.statusToken);
    const secondAhead = await aheadOf(second.statusToken);
    expect(secondAhead - firstAhead).toBe(1);

    // first가 대기에서 빠지면 second만 1 줄고 first 자신의 값은 그대로다 — first는 자기 자신을 세지 않았다.
    await must(db.from("orders").update({ status: "cancelled" }).eq("id", first.orderId));
    expect(await aheadOf(first.statusToken)).toBe(firstAhead);
    expect(await aheadOf(second.statusToken)).toBe(secondAhead - 1);
  });

  test("항목·옵션은 주문 시점 스냅샷 — en 주문은 영어, 영어 이름이 없으면 한국어, 주문 뒤 메뉴를 바꿔도 그대로", async () => {
    const seed = await createMenu({ ko: "씨앗호떡", en: "Seed Hotteok" }, 3000,
      { group: "토핑", name: { ko: "치즈", en: "Cheese" }, extraPrice: 500 });
    const honey = await createMenu({ ko: "꿀호떡" }, 2000,
      { group: "설탕", name: { ko: "적게" }, extraPrice: 0 });
    const created = await placeOrder("en", "cash", [
      { menuItemId: seed.menuId, quantity: 2, optionIds: seed.optionIds },
      { menuItemId: honey.menuId, quantity: 1, optionIds: honey.optionIds },
    ]);

    // 주문 뒤 메뉴·옵션 이름과 가격을 바꾼다 — 상태 페이지는 order_items·order_item_options 스냅샷을 보여야 한다.
    await must(db.from("menu_item_translations").update({ name: "바뀐 메뉴" }).eq("menu_item_id", seed.menuId));
    await must(db.from("option_translations").update({ name: "바뀐 옵션" }).eq("option_id", seed.optionIds[0]));
    await must(db.from("menu_items").update({ base_price: 9900 }).eq("id", seed.menuId));

    const order = await getOrderByToken(created.statusToken, deps);

    expect(order.items).toEqual([
      { name: "Seed Hotteok", quantity: 2, options: ["Cheese"], lineTotal: 7000 },
      { name: "꿀호떡", quantity: 1, options: ["적게"], lineTotal: 2000 },
    ]);
    expect(order.totalAmount).toBe(9000);
  });

  test("형식이 잘못된 토큰은 404 NOT_FOUND — 픽업 번호·주문 ID로는 조회할 수 없다", async () => {
    const menu = await createMenu({ ko: "꿀호떡" }, 2000);
    const created = await placeOrder("ko", "cash", [{ menuItemId: menu.menuId, quantity: 1, optionIds: [] }]);

    await expectNotFound(String(created.pickupNumber), "픽업 번호");
    await expectNotFound(created.orderId, "주문 ID(UUID)");
    await expectNotFound(created.statusToken.toUpperCase(), "대문자로 바꾼 실제 토큰");
    await expectNotFound(created.statusToken.slice(0, 63), "63자");
    await expectNotFound(`${created.statusToken}0`, "65자");
    await expectNotFound("", "빈 값");

    // 대조: 같은 주문의 실제 토큰은 조회된다 — 위 404가 DB·픽스처 문제 때문이 아니다.
    expect((await getOrderByToken(created.statusToken, deps)).orderId).toBe(created.orderId);
  });

  test("형식은 맞지만 없는 토큰(64자 16진수)도 같은 404 NOT_FOUND — 존재 여부를 구분하지 않는다", async () => {
    const menu = await createMenu({ ko: "꿀호떡" }, 2000);
    const created = await placeOrder("ko", "cash", [{ menuItemId: menu.menuId, quantity: 1, optionIds: [] }]);
    const tokens = {
      "무작위 64자": randomBytes(32).toString("hex"),
      "픽업 번호를 0으로 채운 64자": String(created.pickupNumber).padStart(64, "0"),
    };

    for (const [label, token] of Object.entries(tokens)) {
      expect(await repo.findByToken(token), label).toBeNull();
      await expectNotFound(token, label);
    }
  });
});
