import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseSweepRepository } from "@/infra/repositories/supabaseSweepRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { transition } from "@/services/adminOrderService";
import { getOrderByToken, reportTransfer, requestCancel } from "@/services/orderService";
import { sweepOrders } from "@/services/sweepService";

// T-18 미입금 자동 만료(F-17) 연결 검증: POST /api/admin/sweep이 쓰는 조합(sweepOrders → SupabaseSweepRepository →
// DB 함수 sweep_order_timeouts)을 실제 DB에 연결하고, 송금 신고(T-32)·입금 확인(T-16)·취소 요청(T-35) 서비스와 함께 돌린다.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증은 tests/unit/api/adminSweepRoute.test.ts,
// 9분59초/10분 경계·설정값 변경처럼 기준 시각(p_now)을 넣어야 하는 검증은 tests/integration/sweep_expire.sql이 맡는다.
// API는 기준 시각을 받지 않으므로(DB의 now()) 여기서는 주문의 created_at을 과거로 넣어 경과 시간을 만든다.
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const sweepRepository = new SupabaseSweepRepository(db);
const adminId = randomUUID();
const createdOrders: string[] = [];
const createdMenus: string[] = [];

const QUANTITY = 2;
// 만료 기준(분). DB 함수와 같은 규칙으로 읽는다 — 설정(payment.expire_minutes)이 없으면 10.
let expireMinutes = 10;
const sweep = () => sweepOrders(sweepRepository);
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type Status = "pending" | "paid" | "cooking" | "completed" | "cancelled";

// 메뉴 1개(재고 10)와 수량 2인 주문 1건을 만든다. 재고는 주문 시 이미 차감된 상태(8)로 둔다.
async function createOrder(status: Status, paymentMethod: "cash" | "transfer", ageMinutes: number) {
  const menu = await db.from("menu_items").insert({ base_price: 3000, stock: 10 - QUANTITY }).select("id").single();
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
    created_at: minutesAgo(ageMinutes),
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

async function stored(id: string) {
  const { data, error } = await db.from("orders")
    .select("status, transfer_reported_at, closed_at").eq("id", id).single();
  if (error) throw error;
  return { status: data.status as string, reported: data.transfer_reported_at !== null, closed: data.closed_at !== null };
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

const EXPIRE_HISTORY = {
  from_status: "pending", to_status: "expired", action: "expire",
  actor_type: "system", actor_id: null, reason: null,
};

beforeAll(async () => {
  const { data, error } = await db.from("app_settings").select("value").eq("key", "payment.expire_minutes").maybeSingle();
  if (error) throw error;
  if (data) expireMinutes = Number(data.value);
});

afterEach(async () => {
  if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
  if (createdMenus.length) await db.from("menu_items").delete().in("id", createdMenus.splice(0));
});

describe("T-18 스윕 호출: 만료 대상", () => {
  test.each(["transfer", "cash"] as const)(
    "%s 결제대기 주문이 만료 시간을 넘기면 만료 + 재고 복구 + 시스템 이력",
    async (paymentMethod) => {
      const order = await createOrder("pending", paymentMethod, expireMinutes + 1);

      const result = await sweep();

      expect(result).toEqual({ expired: 1, completed: 0 });
      expect(await stored(order.id)).toEqual({ status: "expired", reported: false, closed: true });
      expect(await stock(order.menuId)).toBe(10);
      expect(await history(order.id)).toEqual([EXPIRE_HISTORY]);
    },
  );

  test("만료 시간 1분 전인 결제대기 주문은 그대로", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes - 1);

    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    expect(await stored(order.id)).toEqual({ status: "pending", reported: false, closed: false });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test.each(["paid", "cooking", "completed", "cancelled"] as const)(
    "결제대기가 아닌(%s) 주문은 오래돼도 건드리지 않는다",
    async (status) => {
      const order = await createOrder(status, "transfer", expireMinutes + 60);

      expect(await sweep()).toEqual({ expired: 0, completed: 0 });
      expect((await stored(order.id)).status).toBe(status);
      expect(await stock(order.menuId)).toBe(8);
      expect(await history(order.id)).toEqual([]);
    },
  );

  test("다시 스윕해도 한 번만 만료된다(멱등) — 재고를 두 번 복구하지 않는다", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);

    expect(await sweep()).toEqual({ expired: 1, completed: 0 });
    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    expect(await stock(order.menuId)).toBe(10);
    expect(await history(order.id)).toEqual([EXPIRE_HISTORY]);
  });

  test("스윕이 동시에 두 번 호출돼도(대시보드 2대) 주문은 한 번만 만료된다", async () => {
    const order = await createOrder("pending", "cash", expireMinutes + 1);

    const results = await Promise.all([sweep(), sweep(), sweep()]);

    expect(results.reduce((sum, r) => sum + r.expired, 0)).toBe(1);
    expect(await stored(order.id)).toMatchObject({ status: "expired" });
    expect(await stock(order.menuId)).toBe(10);
    expect(await history(order.id)).toEqual([EXPIRE_HISTORY]);
  });
});

describe("T-18 × T-32 송금 신고", () => {
  test("송금 신고(reportTransfer)된 주문은 만료 시간을 60분 넘겨도 결제대기 유지", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 60);
    await reportTransfer(order.token, { orderRepository });

    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    expect(await stored(order.id)).toEqual({ status: "pending", reported: true, closed: false });
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toEqual([]);
  });

  test("이미 만료된 주문은 송금 신고할 수 없다(409), 신고 시각 저장 0건", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);
    await sweep();

    expect(await rejection(reportTransfer(order.token, { orderRepository }))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await stored(order.id)).toMatchObject({ status: "expired", reported: false });
  });

  test("스윕과 송금 신고가 동시에 와도 '만료됐는데 신고됨' 상태는 생기지 않는다", async () => {
    const orders = await Promise.all(Array.from({ length: 8 }, () => createOrder("pending", "transfer", expireMinutes + 1)));

    // 신고의 마지막 단계(조건부 갱신 한 번)와 스윕을 같은 순간에 보낸다 — 주문마다 어느 쪽이 이길지는 정해져 있지 않다.
    const [swept, ...reports] = await Promise.all([
      sweep(),
      ...orders.map((order) => orderRepository.setTransferReported(order.id)),
    ]);

    let expired = 0;
    for (const [index, order] of orders.entries()) {
      const after = await stored(order.id);
      if (after.status === "expired") {
        // 스윕이 이김: 신고는 기록되지 않고(null) 재고는 복구된다.
        expired += 1;
        expect(after.reported).toBe(false);
        expect(reports[index]).toBeNull();
        expect(await stock(order.menuId)).toBe(10);
        expect(await history(order.id)).toEqual([EXPIRE_HISTORY]);
      } else {
        // 신고가 이김: 결제대기 유지, 재고·이력 그대로.
        expect(after).toEqual({ status: "pending", reported: true, closed: false });
        expect(reports[index]).not.toBeNull();
        expect(await stock(order.menuId)).toBe(8);
        expect(await history(order.id)).toEqual([]);
      }
    }
    expect(swept.expired).toBe(expired);

    // 진 쪽이 뒤늦게 반영되지 않는다 — 다음 스윕은 신고된 주문을 건드리지 않고, 만료된 주문은 신고할 수 없다.
    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    for (const order of orders) {
      const after = await stored(order.id);
      expect(after.status === "expired" && after.reported).toBe(false);
      if (after.status === "expired") {
        expect(await rejection(reportTransfer(order.token, { orderRepository }))).toEqual({ code: "INVALID_TRANSITION", status: 409 });
      }
    }
  });
});

describe("T-18 × 관리자 전환(T-16·T-17)", () => {
  test("만료 직전에 입금 확인된 주문은 만료되지 않는다", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);
    await transition({ orderId: order.id, action: "confirm_payment", adminId }, { orderRepository });

    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    expect((await stored(order.id)).status).toBe("paid");
    expect(await stock(order.menuId)).toBe(8);
    expect(await history(order.id)).toHaveLength(1);
  });

  test("관리자가 취소한 주문은 스윕이 다시 건드리지 않는다 — 재고는 취소 때 한 번만 복구", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);
    await transition({ orderId: order.id, action: "cancel", adminId, reason: "고객 요청" }, { orderRepository });
    expect(await stock(order.menuId)).toBe(10);

    expect(await sweep()).toEqual({ expired: 0, completed: 0 });
    expect((await stored(order.id)).status).toBe("cancelled");
    expect(await stock(order.menuId)).toBe(10);
    expect(await history(order.id)).toHaveLength(1);
  });

  test("만료된 주문은 입금 확인·취소할 수 없다(409)", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);
    await sweep();

    expect(await rejection(transition({ orderId: order.id, action: "confirm_payment", adminId }, { orderRepository })))
      .toEqual({ code: "INVALID_TRANSITION", status: 409 });
    expect(await rejection(transition({ orderId: order.id, action: "cancel", adminId, reason: "사유" }, { orderRepository })))
      .toEqual({ code: "INVALID_TRANSITION", status: 409 });
    // 취소가 거부됐으므로 재고는 만료 때 한 번만 복구된 상태다.
    expect(await stock(order.menuId)).toBe(10);
    expect(await history(order.id)).toEqual([EXPIRE_HISTORY]);
  });

  // 관리자 버튼과 스윕이 같은 순간에 같은 주문을 바꾸려는 경우. 관리자 쪽은 전환의 마지막 단계(DB 함수 호출 한 번)를
  // 스윕과 동시에 보낸다 — 주문마다 어느 쪽이 이길지는 정해져 있지 않다.
  test.each([
    { name: "입금 확인(계좌이체)", paymentMethod: "transfer", to: "paid", action: "confirm_payment", reason: null, stockIfAdminWins: 8 },
    { name: "현금 수령 확인", paymentMethod: "cash", to: "cooking", action: "confirm_cash", reason: null, stockIfAdminWins: 8 },
    { name: "취소", paymentMethod: "transfer", to: "cancelled", action: "cancel", reason: "고객 요청", stockIfAdminWins: 10 },
  ] as const)(
    "스윕과 $name 이 동시에 와도 주문은 한 번만 전환되고 재고는 한 번만 복구된다",
    async ({ paymentMethod, to, action, reason, stockIfAdminWins }) => {
      const orders = await Promise.all(
        Array.from({ length: 8 }, () => createOrder("pending", paymentMethod, expireMinutes + 1)),
      );

      const [swept, ...admin] = await Promise.allSettled([
        sweep(),
        ...orders.map((order) => orderRepository.transition({
          orderId: order.id, from: "pending", to, action,
          actorType: "admin", actorId: adminId, reason, refundChannel: null,
        })),
      ]);

      expect(swept.status).toBe("fulfilled");
      let expired = 0;
      for (const [index, order] of orders.entries()) {
        const after = await stored(order.id);
        const rows = await history(order.id);
        // 어느 쪽이 이기든 이력은 정확히 1행 — 이중 전환이 없다.
        expect(rows).toHaveLength(1);
        if (after.status === "expired") {
          // 스윕이 이김: 관리자 요청은 409로 거부된다.
          expired += 1;
          expect(rows).toEqual([EXPIRE_HISTORY]);
          expect(admin[index].status).toBe("rejected");
          expect((admin[index] as PromiseRejectedResult).reason).toMatchObject({ code: "STATE_CHANGED", status: 409 });
          expect(await stock(order.menuId)).toBe(10);
        } else {
          // 관리자가 이김: 스윕은 이 주문을 건너뛴다.
          expect(after.status).toBe(to);
          expect(rows[0]).toMatchObject({ from_status: "pending", to_status: to, action, actor_type: "admin", actor_id: adminId });
          expect(admin[index].status).toBe("fulfilled");
          expect(await stock(order.menuId)).toBe(stockIfAdminWins);
        }
      }
      expect((swept as PromiseFulfilledResult<{ expired: number }>).value.expired).toBe(expired);

      // 진 쪽이 뒤늦게 반영되지 않는다.
      expect(await sweep()).toEqual({ expired: 0, completed: 0 });
      for (const order of orders) expect(await history(order.id)).toHaveLength(1);
    },
  );
});

describe("T-18 × 고객 화면(T-11·T-35)", () => {
  test("만료된 주문의 상태 조회는 expired이고 송금 신고·취소 요청 버튼 조건이 꺼진다", async () => {
    const order = await createOrder("pending", "transfer", expireMinutes + 1);
    await sweep();

    expect(await getOrderByToken(order.token, { orderRepository })).toMatchObject({
      orderId: order.id, status: "expired", canTransferReport: false, canCancelRequest: false,
    });
    expect(await rejection(requestCancel(order.token, { orderRepository })))
      .toEqual({ code: "CANCEL_REQUEST_NOT_ALLOWED", status: 409 });
  });
});

describe("T-18 만료 시간은 설정값(payment.expire_minutes)", () => {
  // 스윕은 호출할 때마다 설정을 읽는다(서버 캐시 없음 — ADR-0004). 테스트가 끝나면 원래 값으로 되돌린다.
  async function withExpireMinutes(minutes: number, run: () => Promise<void>) {
    const before = await db.from("app_settings").select("value").eq("key", "payment.expire_minutes").maybeSingle();
    if (before.error) throw before.error;
    const set = await db.from("app_settings").upsert({ key: "payment.expire_minutes", value: String(minutes) });
    if (set.error) throw set.error;
    try {
      await run();
    } finally {
      const restore = before.data
        ? await db.from("app_settings").update({ value: before.data.value }).eq("key", "payment.expire_minutes")
        : await db.from("app_settings").delete().eq("key", "payment.expire_minutes");
      if (restore.error) throw restore.error;
    }
  }

  test("설정을 5분으로 줄이면 6분 된 주문이 만료되고 4분 된 주문은 그대로", async () => {
    const old = await createOrder("pending", "transfer", 6);
    const fresh = await createOrder("pending", "cash", 4);

    await withExpireMinutes(5, async () => {
      expect(await sweep()).toEqual({ expired: 1, completed: 0 });
    });

    expect((await stored(old.id)).status).toBe("expired");
    expect(await stock(old.menuId)).toBe(10);
    expect((await stored(fresh.id)).status).toBe("pending");
    expect(await stock(fresh.menuId)).toBe(8);
  });

  test("설정을 30분으로 늘리면 29분 된 주문은 만료되지 않고, 되돌린 뒤 스윕하면 만료된다", async () => {
    const order = await createOrder("pending", "transfer", 29);

    await withExpireMinutes(30, async () => {
      expect(await sweep()).toEqual({ expired: 0, completed: 0 });
      expect((await stored(order.id)).status).toBe("pending");
    });

    // 설정이 원래 값(기본 10분)으로 돌아왔는지: 29분 된 주문이 이제 만료 대상이다.
    if (expireMinutes < 29) {
      expect(await sweep()).toEqual({ expired: 1, completed: 0 });
      expect((await stored(order.id)).status).toBe("expired");
    }
  });
});
