import { execFile } from "node:child_process";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository, GUARDED_TRANSITION } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { TransitionAction } from "@/domain/order/status";
import type { OrderRepository } from "@/services/ports";
import { resolveCancelRequest, transition } from "@/services/adminOrderService";
import { requestCancel } from "@/services/orderService";

// T-54(#155·#161 리뷰): 관리자가 주문을 읽은 뒤 고객 취소 요청이 저장돼도 조리중으로 넘어가지 않는지,
// 반대로 관리자가 먼저 잠근 경우 고객 요청이 처리 불가 상태로 남지 않는지를 실제 PostgreSQL에서 확인한다.
// 동작을 바꾸는 mock은 쓰지 않는다(DECISIONS #46). 0106 보호 함수의 권한·SQL 자체 검증은 DB1 담당.
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const deps = { orderRepository, adminOrderRepository };
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];
const execFileAsync = promisify(execFile);

const QUANTITY = 2;
const STOCK_AFTER_ORDER = 8;

const GUARDED = [
  { action: "confirm_payment", status: "pending", paymentMethod: "transfer" },
  { action: "confirm_cash", status: "pending", paymentMethod: "cash" },
  { action: "start_cooking", status: "paid", paymentMethod: "transfer" },
] as const;

// 메뉴 1개(재고 10)와 수량 2인 주문 1건. 재고는 주문 시 이미 차감된 상태(8)로 둔다.
async function createOrder(status: string, paymentMethod: "cash" | "transfer") {
  const menu = await db.from("menu_items").insert({ base_price: 3000, stock: STOCK_AFTER_ORDER }).select("id").single();
  if (menu.error) throw menu.error;
  const menuId = menu.data.id as string;
  createdMenus.push(menuId);

  const token = randomBytes(32).toString("hex");
  const order = await db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status,
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
    .select("status, cooking_started_at, cancel_requested_at, cancel_rejected_at").eq("id", id).single();
  if (error) throw error;
  return data as { status: string; cooking_started_at: string | null; cancel_requested_at: string | null; cancel_rejected_at: string | null };
}

async function stock(menuId: string) {
  const { data, error } = await db.from("menu_items").select("stock").eq("id", menuId).single();
  if (error) throw error;
  return data.stock as number;
}

async function history(id: string) {
  const { data, error } = await db.from("order_status_history")
    .select("from_status, to_status, action").eq("order_id", id).order("id");
  if (error) throw error;
  return data;
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return { code: (error as AppError).code, status: (error as AppError).status };
}

// 서비스가 주문을 읽은 뒤, 전환 직전에 고객 취소 요청이 저장되는 순서를 그대로 만든다.
function customerRequestsInBetween(token: string): Pick<OrderRepository, "findById" | "transition"> {
  return {
    findById: orderRepository.findById,
    async transition(command) {
      await requestCancel(token, deps);
      return orderRepository.transition(command);
    },
  };
}

// 별도 DB 세션에서 보호 함수로 전환하고 행 잠금을 쥔 채 잠시 기다린다(t07-create-order와 같은 방식).
function psqlArgs(): string[] {
  const config = readFileSync("supabase/config.toml", "utf8");
  const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m.exec(config)?.[1];
  if (!projectId) throw new Error("테스트 DB의 Supabase project_id를 확인할 수 없습니다.");
  return [
    "exec", "-i", `supabase_db_${projectId}`,
    "psql", "-X", "-q", "-t", "-A", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
  ];
}

async function psql(sql: string): Promise<string> {
  const child = execFileAsync("docker", psqlArgs(), { encoding: "utf8", timeout: 60_000 });
  child.child.stdin?.end(sql);
  return (await child).stdout.trim();
}

function holdGuardedTransition(orderId: string, label: string, holdSeconds: number): Promise<string> {
  return psql([
    `SET application_name = '${label}';`,
    "SET ROLE service_role;",
    "BEGIN;",
    `SELECT status FROM public.${GUARDED_TRANSITION.fn}(
       p_order_id => '${orderId}', p_from => 'pending', p_to => 'cooking', p_action => 'confirm_payment',
       p_actor_type => 'admin', p_actor_id => '${adminId}', p_reason => NULL, p_refund_channel => NULL,
       ${GUARDED_TRANSITION.expectedRequestedAt} => NULL, ${GUARDED_TRANSITION.expectedRejectedAt} => NULL);`,
    `SELECT pg_sleep(${holdSeconds});`,
    "COMMIT;",
  ].join("\n"));
}

// 그 세션이 잠금을 쥔 채 기다리는 중인지 확인한다(전환은 끝났고 pg_sleep 실행 중).
async function waitUntilHolding(label: string) {
  for (let i = 0; i < 100; i += 1) {
    const count = await psql(
      `SELECT count(*) FROM pg_stat_activity WHERE application_name = '${label}' AND query LIKE '%pg_sleep%';`,
    );
    if (count === "1") return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("잠금을 쥔 세션을 확인하지 못했습니다.");
}

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("T-54 고객 먼저 — 관리자가 읽은 뒤 취소 요청이 저장된 경우", () => {
  test.each(GUARDED)("$action: 409 STATE_CHANGED, 요청은 남고 상태·재고·이력은 그대로", async ({ action, status, paymentMethod }) => {
    const order = await createOrder(status, paymentMethod);

    const error = await rejection(transition(
      { orderId: order.id, action: action as TransitionAction, adminId },
      { orderRepository: customerRequestsInBetween(order.token) },
    ));

    expect(error).toEqual({ code: "STATE_CHANGED", status: 409 });
    const after = await stored(order.id);
    expect(after.status).toBe(status);
    expect(after.cooking_started_at).toBeNull();
    expect(after.cancel_requested_at).not.toBeNull();
    expect(after.cancel_rejected_at).toBeNull();
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER);
    expect(await history(order.id)).toEqual([]);
  });

  test("막힌 뒤 관리자가 요청을 승인하면 취소·재고 복구 — 처리 불가로 남지 않는다", async () => {
    const order = await createOrder("pending", "transfer");
    await rejection(transition(
      { orderId: order.id, action: "confirm_payment", adminId },
      { orderRepository: customerRequestsInBetween(order.token) },
    ));

    await resolveCancelRequest({ orderId: order.id, decision: "approve", reason: "고객 요청", adminId }, deps);

    expect((await stored(order.id)).status).toBe("cancelled");
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER + QUANTITY);
  });

  test("막힌 뒤 관리자가 요청을 거절하면 다시 입금 확인 → 조리중", async () => {
    const order = await createOrder("pending", "transfer");
    await rejection(transition(
      { orderId: order.id, action: "confirm_payment", adminId },
      { orderRepository: customerRequestsInBetween(order.token) },
    ));
    await resolveCancelRequest({ orderId: order.id, decision: "reject", reason: "입금 확인됨", adminId }, deps);

    const result = await transition({ orderId: order.id, action: "confirm_payment", adminId }, { orderRepository });

    expect(result.status).toBe("cooking");
    expect((await history(order.id)).map((row) => row.action)).toEqual(["cancel_request_reject", "confirm_payment"]);
  });
});

describe("T-54 관리자 먼저 — 보호 함수가 행을 잠근 동안 고객이 취소 요청", () => {
  test("고객 요청은 잠금이 풀릴 때까지 기다린 뒤 409 CANCEL_REQUEST_NOT_ALLOWED, 주문은 조리중·요청 없음", async () => {
    const order = await createOrder("pending", "transfer");
    const label = `t54-hold-${order.id.slice(0, 8)}`;

    const admin = holdGuardedTransition(order.id, label, 2);
    await waitUntilHolding(label);
    const started = Date.now();
    const customer = await rejection(requestCancel(order.token, deps));
    const waited = Date.now() - started;
    await admin;

    expect(customer).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
    expect(waited).toBeGreaterThan(500);
    const after = await stored(order.id);
    expect(after.status).toBe("cooking");
    expect(after.cancel_requested_at).toBeNull();
    expect(await history(order.id)).toEqual([{ from_status: "pending", to_status: "cooking", action: "confirm_payment" }]);
  }, 30_000);

  // DB2 #167의 시나리오: 관리자 전환이 먼저 끝난 뒤의 고객 요청을 3개 동작 모두에서 본다.
  test.each(GUARDED)("$action 완료 뒤 고객 취소 요청은 409 CANCEL_REQUEST_NOT_ALLOWED, 기록되지 않는다", async ({ action, status, paymentMethod }) => {
    const order = await createOrder(status, paymentMethod);

    const result = await transition({ orderId: order.id, action: action as TransitionAction, adminId }, { orderRepository });
    const customer = await rejection(requestCancel(order.token, deps));

    expect(result.status).toBe("cooking");
    expect(customer).toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
    // 서비스 확인을 건너뛰어도 DB 조건부 UPDATE가 0건인지(저장소 단계 방어)
    expect(await orderRepository.setCancelRequested(order.id)).toBeNull();
    const after = await stored(order.id);
    expect(after.status).toBe("cooking");
    expect(after.cancel_requested_at).toBeNull();
    expect(after.cancel_rejected_at).toBeNull();
    expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER);
    expect((await history(order.id)).map((row) => row.action)).toEqual([action]);
  });
});

describe("T-54 진짜 동시 — 입금 확인과 고객 취소 요청을 함께 보낸다", () => {
  test("주문마다 한쪽만 성공하고, 조리중인데 요청이 걸린 주문은 0건", async () => {
    const orders = await Promise.all(Array.from({ length: 8 }, () => createOrder("pending", "transfer")));

    const results = await Promise.all(orders.map((order) => Promise.allSettled([
      transition({ orderId: order.id, action: "confirm_payment", adminId }, { orderRepository }),
      requestCancel(order.token, deps),
    ])));

    for (const [i, order] of orders.entries()) {
      const [admin, customer] = results[i];
      expect([admin.status, customer.status].filter((s) => s === "fulfilled")).toHaveLength(1);
      for (const settled of [admin, customer]) {
        if (settled.status === "rejected") expect(settled.reason).toBeInstanceOf(AppError);
      }

      const after = await stored(order.id);
      if (after.status === "cooking") {
        expect(after.cancel_requested_at).toBeNull();
        expect(await history(order.id)).toHaveLength(1);
      } else {
        expect(after.status).toBe("pending");
        expect(after.cancel_requested_at).not.toBeNull();
        expect(after.cancel_rejected_at).toBeNull();
        expect(await history(order.id)).toEqual([]);
      }
      expect(await stock(order.menuId)).toBe(STOCK_AFTER_ORDER);
    }
  }, 30_000);
});
