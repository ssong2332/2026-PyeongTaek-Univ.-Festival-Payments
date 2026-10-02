import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createSupabaseRateLimitRepository } from "@/infra/repositories/supabaseRateLimitRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { createOrder } from "@/services/orderService";

// 서비스 → 실제 저장소 → PostgREST → PostgreSQL. setup.ts가 운영 DB 접속을 차단한다.
const db = createServiceClient();
const rateLimitRepository = createSupabaseRateLimitRepository(db);
const orderRepository = createSupabaseOrderRepository(db);
const now = new Date("2026-10-02T12:00:00.000Z");
const prefix = `t51-${randomUUID()}`;
const menuId = randomUUID();
const orderKeys: string[] = [];
let adminId: string | undefined;
let pickupBefore: number | null = null;

function browserClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("로컬 Supabase 접속 설정이 없습니다.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const anon = browserClient();
const authenticated = browserClient();

async function must<T>(request: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await request;
  if (error) throw error;
  return data as NonNullable<T>;
}

async function count(key: string, scope = "order_create") {
  return must(db.from("rate_limits").select("window_start, count").eq("scope", scope).eq("key", key)
    .order("window_start"));
}

async function pickup() {
  const row = await must(db.from("counters").select("value").eq("key", "pickup_number").maybeSingle());
  return row?.value ?? null;
}

function requestOrder(key: string, clientKey: string) {
  return createOrder({
    idempotencyKey: key, paymentMethod: "cash", locale: "ko",
    items: [{ menuItemId: menuId, quantity: 1, optionIds: [] }],
  }, { orderRepository, rateLimitRepository, clientKey, clock: { now: () => now } });
}

beforeAll(async () => {
  pickupBefore = await pickup();
  await must(db.from("menu_items").insert({ id: menuId, base_price: 3000, stock: 5 }));
  await must(db.from("menu_item_translations").insert({ menu_item_id: menuId, locale: "ko", name: "T-51 검증" }));
  const email = `${prefix}@example.test`;
  const password = `T51-${randomUUID()}`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  adminId = created.data.user.id;
  const signedIn = await authenticated.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
});

afterAll(async () => {
  if (orderKeys.length) await must(db.from("orders").delete().in("idempotency_key", orderKeys));
  await must(db.from("menu_items").delete().eq("id", menuId));
  await must(db.from("rate_limits").delete().like("key", `${prefix}%`));
  if (pickupBefore === null) await must(db.from("counters").delete().eq("key", "pickup_number"));
  else await must(db.from("counters").update({ value: pickupBefore }).eq("key", "pickup_number"));
  if (adminId) {
    const deleted = await db.auth.admin.deleteUser(adminId);
    if (deleted.error) throw deleted.error;
  }
});

test("100회 허용, 101회 거부, p_now +60초에 새 윈도에서 허용", async () => {
  const key = `${prefix}-boundary`;
  for (let i = 0; i < 100; i++) {
    expect(await rateLimitRepository.consume("order_create", key, 100, 60, now)).toBe(true);
  }
  expect(await rateLimitRepository.consume("order_create", key, 100, 60, now)).toBe(false);
  const rows = await count(key);
  expect(rows).toHaveLength(1);
  expect(new Date(rows[0].window_start).getTime()).toBe(now.getTime());
  expect(rows[0].count).toBe(100);
  expect(await rateLimitRepository.consume("order_create", key, 100, 60,
    new Date(now.getTime() + 60_000))).toBe(true);
  expect((await count(key)).map((row) => row.count)).toEqual([100, 1]);
});

test("한도를 넘는 동시 요청도 정확히 100건만 허용한다", async () => {
  const key = `${prefix}-concurrent`;
  const results = await Promise.all(Array.from({ length: 120 }, () =>
    rateLimitRepository.consume("order_create", key, 100, 60, now)));
  expect(results.filter(Boolean)).toHaveLength(100);
  expect(results.filter((allowed) => !allowed)).toHaveLength(20);
  expect((await count(key)).map((row) => row.count)).toEqual([100]);
});

test("멱등 재요청은 한도가 소진되어도 기존 주문을 반환하며 카운트·재고·픽업 번호가 그대로다", async () => {
  const key = randomUUID();
  orderKeys.push(key);
  const clientKey = `${prefix}-replay`;
  const first = await requestOrder(key, clientKey);
  expect(first.created).toBe(true);
  const rows = await count(clientKey);
  await must(db.from("rate_limits").update({ count: 100 }).eq("key", clientKey));
  const beforeCount = await count(clientKey);
  const beforePickup = await pickup();
  const beforeMenu = await must(db.from("menu_items").select("stock").eq("id", menuId).single());
  const replay = await requestOrder(key, clientKey);
  expect(replay).toMatchObject({ orderId: first.orderId, pickupNumber: first.pickupNumber, created: false });
  expect(rows.map((row) => row.count)).toEqual([1]);
  expect(await count(clientKey)).toEqual(beforeCount);
  expect(await pickup()).toBe(beforePickup);
  expect(await must(db.from("menu_items").select("stock").eq("id", menuId).single())).toEqual(beforeMenu);
});

test("한도 초과는 429이며 주문·항목 생성, 재고 차감, 픽업 번호 소비가 없다", async () => {
  const key = randomUUID();
  orderKeys.push(key);
  const clientKey = `${prefix}-overflow`;
  await must(db.from("rate_limits").insert({ scope: "order_create", key: clientKey,
    window_start: now.toISOString(), count: 100 }));
  const beforePickup = await pickup();
  const beforeMenu = await must(db.from("menu_items").select("stock").eq("id", menuId).single());
  await expect(requestOrder(key, clientKey)).rejects.toMatchObject({
    code: "RATE_LIMITED", status: 429, details: { retryAfterSeconds: 60 },
  });
  expect(await must(db.from("orders").select("id, order_items(id)").eq("idempotency_key", key))).toEqual([]);
  expect(await must(db.from("menu_items").select("stock").eq("id", menuId).single())).toEqual(beforeMenu);
  expect(await pickup()).toBe(beforePickup);
  expect((await count(clientKey)).map((row) => row.count)).toEqual([100]);
});

describe.each([
  { role: "anon", client: anon },
  { role: "authenticated", client: authenticated },
])("$role 브라우저 권한", ({ role, client }) => {
  test("rate_limits 읽기·쓰기 및 consume_rate_limit 실행을 거부한다", async () => {
    const key = `${prefix}-permission-${role}`;
    await must(db.from("rate_limits").insert({ scope: "order_create", key,
      window_start: now.toISOString(), count: 1 }));
    const requests = [
      client.from("rate_limits").select("*").eq("key", key),
      client.from("rate_limits").insert({ scope: "order_create", key: `${key}-new`,
        window_start: now.toISOString(), count: 1 }),
      client.from("rate_limits").update({ count: 99 }).eq("key", key),
      client.from("rate_limits").delete().eq("key", key),
    ];
    for (const request of requests) {
      const { error } = await request;
      expect(error?.code).toBe("42501");
      expect(error?.message).toContain("permission denied for table rate_limits");
    }
    const { error } = await client.rpc("consume_rate_limit", {
      p_scope: "order_create", p_key: key, p_limit: 100, p_window_seconds: 60, p_now: now.toISOString(),
    });
    expect(error?.code).toBe("42501");
    expect(error?.message).toContain("permission denied for function consume_rate_limit");
    expect((await count(key)).map((row) => row.count)).toEqual([1]);
    expect(await count(`${key}-new`)).toEqual([]);
  });
});
