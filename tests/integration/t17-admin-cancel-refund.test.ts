import { randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/infra/supabase/session");

import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/orders/[id]/transition/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";

// T-17 취소·환불(F-18·F-19): T-16·T-17 공통 상태 전환 API(#60)를 실제 DB로 확인한다.
// 규칙 자체(허용 전환·사유·환불 경로)는 T-14 단위·DB 함수 테스트에 있고, 여기서는 API 입구부터 DB까지를 본다.
const db = createServiceClient();
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

function requestTransition(id: string, body: Record<string, unknown>) {
  return POST(new NextRequest(`http://localhost/api/admin/orders/${id}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
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
  vi.clearAllMocks();
});

describe("T-17 취소 (결제대기·결제확인)", () => {
  test.each([
    ["pending", "cash"],
    ["paid", "transfer"],
  ] as const)("%s(%s) 주문 취소: 재고를 항목 수량만큼 복구하고 사유·주체 이력을 남긴다", async (status, paymentMethod) => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder(status, paymentMethod, [{ quantity: 2 }, { quantity: 3 }]);

    const response = await requestTransition(id, { action: "cancel", reason: "  고객 요청  " });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, status: "cancelled", refundChannel: null, availableActions: [] });
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
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("cooking", paymentMethod, [{ quantity: 1 }, { quantity: 4 }]);

    const response = await requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, status: "refunded", refundChannel, availableActions: [] });
    expect(await stocks(menuIds)).toEqual([10, 10]);
    expect(await storedOrder(id)).toMatchObject({ status: "refunded", refund_channel: refundChannel });
    expect(await history(id)).toEqual([{
      from_status: "cooking", to_status: "refunded", action: "refund",
      actor_type: "admin", actor_id: adminId, reason: "재료 소진",
    }]);
  });

  test("환불하면 매출에서 빠지고 환불 금액·건수로 집계된다(T-21 get_stats)", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    // 다른 테스트 주문과 섞이지 않게 먼 미래 날짜(KST)에 둔다.
    const day = `2098-${String(randomInt(1, 13)).padStart(2, "0")}-${String(randomInt(1, 29)).padStart(2, "0")}`;
    const { id } = await createOrder("cooking", "transfer", [{ quantity: 2 }], `${day}T03:00:00Z`);
    const statsOf = async () => {
      const { data, error } = await db.rpc("get_stats", { p_date: day });
      if (error) throw error;
      return data as { sales: number; refundedAmount: number; refundedCount: number; byMenu: unknown[] };
    };
    expect(await statsOf()).toMatchObject({ sales: 6000, refundedAmount: 0, refundedCount: 0 });

    expect((await requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel: "bank" })).status).toBe(200);

    expect(await statsOf()).toMatchObject({ sales: 0, refundedAmount: 6000, refundedCount: 1, byMenu: [] });
  });
});

describe("T-17 거부 — 주문·재고·이력이 바뀌지 않는다", () => {
  test.each([
    ["사유 없음", { action: "cancel" }, "REASON_REQUIRED"],
    ["사유 공백", { action: "cancel", reason: "   " }, "REASON_REQUIRED"],
    ["사유 빈 문자열(요청 규격 1..200자 위반)", { action: "cancel", reason: "" }, "VALIDATION_ERROR"],
  ])("취소 %s → 400 %s", async (_label, body, code) => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("pending", "cash", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    const response = await requestTransition(id, body);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(code);
    await expectUnchanged(id, menuIds, "pending", before);
  });

  test("환불 사유 공백 → 400 REASON_REQUIRED", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("cooking", "transfer", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    const response = await requestTransition(id, { action: "refund", reason: " ", refundChannel: "bank" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("REASON_REQUIRED");
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test("환불 경로 없음 → 400 REFUND_CHANNEL_REQUIRED", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("cooking", "transfer", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    const response = await requestTransition(id, { action: "refund", reason: "재료 소진" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("REFUND_CHANNEL_REQUIRED");
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test.each([
    ["cash", "bank"],
    ["transfer", "cash"],
  ] as const)("%s 주문에 결제수단과 다른 환불 경로(%s) → 409 INVALID_TRANSITION", async (paymentMethod, refundChannel) => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("cooking", paymentMethod, [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    const response = await requestTransition(id, { action: "refund", reason: "재료 소진", refundChannel });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVALID_TRANSITION");
    await expectUnchanged(id, menuIds, "cooking", before);
  });

  test.each([
    ["cancel", { action: "cancel", reason: "고객 요청" }],
    ["refund", { action: "refund", reason: "고객 요청", refundChannel: "cash" }],
  ])("완료 주문 %s → 409 INVALID_TRANSITION", async (_label, body) => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("completed", "cash", [{ quantity: 2 }]);
    const before = await stocks(menuIds);

    const response = await requestTransition(id, body);

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVALID_TRANSITION");
    await expectUnchanged(id, menuIds, "completed", before);
  });
});

describe("T-17 중복 처리", () => {
  test("같은 주문을 동시에 두 번 취소해도 한 번만 반영: 200·409, 재고 1회 복구, 이력 1행", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("paid", "transfer", [{ quantity: 3 }]);

    const responses = await Promise.all([
      requestTransition(id, { action: "cancel", reason: "고객 요청" }),
      requestTransition(id, { action: "cancel", reason: "고객 요청" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await stocks(menuIds)).toEqual([10]);
    expect(await history(id)).toHaveLength(1);
  });

  test("이미 환불된 주문을 다시 환불하면 409, 재고는 한 번만 복구", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { id, menuIds } = await createOrder("cooking", "cash", [{ quantity: 2 }]);
    const body = { action: "refund", reason: "재료 소진", refundChannel: "cash" };

    expect((await requestTransition(id, body)).status).toBe(200);
    const again = await requestTransition(id, body);

    expect(again.status).toBe(409);
    expect(await stocks(menuIds)).toEqual([10]);
    expect(await history(id)).toHaveLength(1);
  });
});
