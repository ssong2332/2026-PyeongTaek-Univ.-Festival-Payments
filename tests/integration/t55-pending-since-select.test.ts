import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseSweepRepository } from "@/infra/repositories/supabaseSweepRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { getAdminOrderById, listAdminOrders } from "@/services/adminOrderService";
import { getOrderByToken, reportTransfer, requestCancel } from "@/services/orderService";
import { sweepOrders } from "@/services/sweepService";

// T-55 후속(#159 팀장 최종 승인 2026-11-12 "후속 필수" 1~3, #155 2026-11-12 인계 2·3번):
// 고객 ORDER_BY_TOKEN_SELECT·관리자 ORDER_QUERY_SELECT가 0107의 pending_since를 실제로 읽어
// 고객 상태 API(UTC ISO Z)·관리자 목록·관리자 상세 세 곳에 같은 값을 내려주는지 본다.
// 되돌리기는 0107 RPC를 직접 불러 만든다(앱 연결은 #175 범위). 동작을 바꾸는 mock은 쓰지 않는다(DECISIONS #46).
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const sweepRepository = new SupabaseSweepRepository(db);
const deps = { orderRepository, adminOrderRepository };
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

// 만료 설정 상한(120분)보다 충분히 오래된 시각 — 설정값과 관계없이 "만료 대상"이 되게 한다.
const LONG_AGO_MINUTES = 200;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function must<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) throw error;
  if (data === null || data === undefined) throw new Error("no rows returned");
  return data as NonNullable<T>;
}

async function createOrder(options: { status: "pending" | "cooking"; createdAt?: string }) {
  const menu = await must(db.from("menu_items").insert({ base_price: 3000, stock: 8 }).select("id").single());
  createdMenus.push(menu.id as string);

  const token = randomBytes(32).toString("hex");
  const pickupNumber = randomInt(100_000, 2_000_000_000);
  const order = await must(db.from("orders").insert({
    pickup_number: pickupNumber,
    status: options.status,
    payment_method: "transfer",
    total_amount: 3000,
    idempotency_key: randomUUID(),
    status_token: token,
    ...(options.createdAt && { created_at: options.createdAt }),
    ...(options.status === "cooking" && { paid_at: minutesAgo(1), cooking_started_at: minutesAgo(1) }),
  }).select("id").single());
  const id = order.id as string;
  createdOrders.push(id);

  await must(db.from("order_items").insert({
    order_id: id, menu_item_id: menu.id, menu_name_ko: "테스트 메뉴",
    unit_price: 3000, quantity: 1, line_total: 3000, sort_order: 0,
  }).select("id"));
  return { id, token, pickupNumber };
}

async function revert(id: string) {
  await must(db.rpc("revert_transfer_order_to_pending", { p_order_id: id, p_actor_id: adminId, p_reason: "입금 확인 실수" }));
}

async function storedPendingSince(id: string) {
  const row = await must(db.from("orders").select("pending_since").eq("id", id).single());
  return row.pending_since as string | null;
}

async function threeViews(order: { id: string; token: string; pickupNumber: number }) {
  const customer = await getOrderByToken(order.token, deps);
  const list = await listAdminOrders(adminOrderRepository, { pickupNumber: order.pickupNumber });
  const detail = await getAdminOrderById(adminOrderRepository, order.id);
  const listed = list.orders.find((o) => o.id === order.id);
  expect(listed).toBeDefined();
  return { customer: customer.pendingSince, list: listed!.pendingSince, detail: detail.pendingSince, canCancelRequest: customer.canCancelRequest };
}

afterEach(async () => {
  if (createdOrders.length) await must(db.from("orders").delete().in("id", createdOrders.splice(0)).select("id"));
  if (createdMenus.length) await must(db.from("menu_items").delete().in("id", createdMenus.splice(0)).select("id"));
});

describe("T-55 pending_since 조회 연결 — 고객 상태·관리자 목록·관리자 상세", () => {
  test("되돌린 주문: 세 응답 모두 DB의 pending_since와 같은 시각, 고객 응답은 UTC ISO(…Z)", async () => {
    const order = await createOrder({ status: "cooking" });
    await revert(order.id);
    const stored = await storedPendingSince(order.id);
    expect(stored).not.toBeNull();

    const views = await threeViews(order);

    expect(views.customer).toMatch(/Z$/);
    expect(Date.parse(views.customer!)).toBe(Date.parse(stored!));
    expect(Date.parse(views.list!)).toBe(Date.parse(stored!));
    expect(Date.parse(views.detail!)).toBe(Date.parse(stored!));
  });

  test("되돌린 적 없는 주문(레거시·초기 주기): 세 응답 모두 null", async () => {
    const order = await createOrder({ status: "pending" });

    const views = await threeViews(order);

    expect(views).toMatchObject({ customer: null, list: null, detail: null });
  });

  test("새 주기 정책: 주문은 오래됐어도 되돌린 시각부터 만료를 세고, 취소 재요청이 가능하다", async () => {
    const order = await createOrder({ status: "cooking", createdAt: minutesAgo(LONG_AGO_MINUTES) });
    await revert(order.id);

    await sweepOrders(sweepRepository);
    const afterSweep = await threeViews(order);
    expect((await getOrderByToken(order.token, deps)).status).toBe("pending");
    expect(afterSweep.canCancelRequest).toBe(true);
    expect((await requestCancel(order.token, deps)).cancelRequestedAt).not.toBeNull();
  });

  // #155 팀장 결정(2026-11-11) 4번·Tasks T-55 테스트 "이전 주기 송금 신고가 새 주기 만료를 막지 않음":
  // 고객 응답에서 이전 신고는 사라지고(재신고 버튼 다시 보임), 새 주기 기한이 지나면 만료된다.
  test("이전 주기 송금 신고는 새 주기를 막지 않는다 — 고객 응답 신고 없음·재신고 가능, 기한이 지나면 만료", async () => {
    const order = await createOrder({ status: "cooking" });
    await must(db.from("orders").update({ transfer_reported_at: minutesAgo(5) }).eq("id", order.id).select("id"));
    await revert(order.id);

    const afterRevert = await getOrderByToken(order.token, deps);
    expect(afterRevert).toMatchObject({ status: "pending", transferReportedAt: null, canTransferReport: true });

    await must(db.from("orders").update({ pending_since: minutesAgo(LONG_AGO_MINUTES) }).eq("id", order.id).select("id"));
    await sweepOrders(sweepRepository);
    expect((await getOrderByToken(order.token, deps)).status).toBe("expired");
  });

  test("새 주기에 다시 송금 신고하면 고객 응답에 새 신고가 보이고, 기한이 지나도 만료되지 않는다", async () => {
    const order = await createOrder({ status: "cooking" });
    await must(db.from("orders").update({ transfer_reported_at: minutesAgo(5) }).eq("id", order.id).select("id"));
    await revert(order.id);
    await must(db.from("orders").update({ pending_since: minutesAgo(LONG_AGO_MINUTES) }).eq("id", order.id).select("id"));

    const { transferReportedAt } = await reportTransfer(order.token, deps);
    const reported = await getOrderByToken(order.token, deps);
    expect(reported).toMatchObject({ status: "pending", canTransferReport: false });
    expect(Date.parse(reported.transferReportedAt!)).toBe(Date.parse(transferReportedAt));

    await sweepOrders(sweepRepository);
    expect((await getOrderByToken(order.token, deps)).status).toBe("pending");
  });

  test("새 주기도 되돌린 시각에서 만료 시간이 지나면 만료된다 — 응답의 pendingSince가 만료 기준과 같은 값", async () => {
    const order = await createOrder({ status: "cooking" });
    await revert(order.id);
    const longAgo = minutesAgo(LONG_AGO_MINUTES);
    await must(db.from("orders").update({ pending_since: longAgo }).eq("id", order.id).select("id"));

    expect(Date.parse((await getOrderByToken(order.token, deps)).pendingSince!)).toBe(Date.parse(longAgo));
    await sweepOrders(sweepRepository);

    const after = await getOrderByToken(order.token, deps);
    expect(after.status).toBe("expired");
    expect(Date.parse(after.pendingSince!)).toBe(Date.parse(longAgo));
  });
});
