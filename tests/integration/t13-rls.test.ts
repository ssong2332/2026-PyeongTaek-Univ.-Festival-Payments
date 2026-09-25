import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";

// T-13 DB1 파트: 브라우저가 실제로 쓰는 경로(PostgREST + anon 키)로 RLS·권한을 검증한다(N-04, Architecture 3절).
// - 비로그인(anon): 모든 테이블 읽기·쓰기 거부, DB 함수 실행 거부
// - 로그인 관리자(authenticated): counters 외 SELECT만 허용, 쓰기·DB 함수 실행 거부
// 거부는 "에러" 또는 "0행"으로 나타날 수 있으므로, 쓰기 시도 뒤에는 service_role로 실제 값이 그대로인지 다시 본다.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`통합 테스트 환경 변수 ${name}가 없습니다.`);
  return value;
}

function browserClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const TABLES = [
  "menu_items", "menu_item_translations", "option_groups", "option_group_translations",
  "options", "option_translations", "counters", "orders", "order_items",
  "order_item_options", "order_status_history", "app_settings",
] as const;

const service = createServiceClient();
const anon = browserClient();
const admin = browserClient();

const menuId = randomUUID();
const orderId = randomUUID();
const settingKey = `t13.${randomUUID()}`;
const counterKey = `t13-${randomUUID()}`;
const adminEmail = `t13-${randomUUID()}@example.test`;
const adminPassword = `T13-${randomUUID()}`;
let adminUserId: string | undefined;

async function must<T>(label: string, promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label} 실패: ${JSON.stringify(error)}`);
  return data;
}

// 함수가 이 DB에 있는지는 service_role로 부작용 없는 호출을 해 보고 판단한다(없으면 PostgREST PGRST202).
async function functionExists(fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { error } = await service.rpc(fn, args);
  return error?.code !== "PGRST202";
}

const createOrderArgs = {
  p_idempotency_key: randomUUID(), p_payment_method: "cash", p_locale: "ko", p_items: [],
};
const transitionArgs = {
  p_order_id: orderId, p_from: "pending", p_to: "paid", p_action: "confirm_payment",
  p_actor_type: "admin", p_actor_id: null, p_reason: null, p_refund_channel: null,
};

beforeAll(async () => {
  // 읽기 결과가 0행일 때 "데이터가 없어서"가 아니라 "막혀서"임을 보장하려고 테이블마다 행을 둔다.
  await must("메뉴 준비", service.from("menu_items").insert({ id: menuId, base_price: 1000, stock: 1 }));
  await must("번역 준비", service.from("menu_item_translations")
    .insert({ menu_item_id: menuId, locale: "ko", name: "T-13 검증 메뉴" }));
  await must("주문 준비", service.from("orders").insert({
    id: orderId, pickup_number: randomInt(1_000_000_000, 2_000_000_000), payment_method: "cash",
    total_amount: 1000, idempotency_key: randomUUID(), status_token: randomBytes(32).toString("hex"),
  }));
  await must("설정 준비", service.from("app_settings").insert({ key: settingKey, value: "before" }));
  await must("카운터 준비", service.from("counters").insert({ key: counterKey, value: 7 }));

  const created = await service.auth.admin.createUser({
    email: adminEmail, password: adminPassword, email_confirm: true,
  });
  if (created.error) throw new Error(`관리자 계정 준비 실패: ${created.error.message}`);
  adminUserId = created.data.user.id;
  const signIn = await admin.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  if (signIn.error) throw new Error(`관리자 로그인 실패: ${signIn.error.message}`);
});

afterAll(async () => {
  await service.from("orders").delete().eq("id", orderId);
  await service.from("menu_items").delete().eq("id", menuId);
  await service.from("app_settings").delete().eq("key", settingKey);
  await service.from("counters").delete().eq("key", counterKey);
  if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
});

async function orderRow() {
  return must("주문 확인", service.from("orders").select("status, total_amount").eq("id", orderId).single());
}

async function blockedReads(client: SupabaseClient, tables: readonly string[]): Promise<string[]> {
  const leaks: string[] = [];
  for (const table of tables) {
    const { data, error } = await client.from(table).select("*").limit(1);
    if (!error && (data ?? []).length > 0) leaks.push(table);
  }
  return leaks;
}

describe("비로그인(anon) 클라이언트", () => {
  test("12개 테이블 모두 한 행도 읽지 못한다", async () => {
    expect(await blockedReads(anon, TABLES)).toEqual([]);
  });

  test("주문·메뉴·설정을 만들거나 바꾸거나 지우지 못한다", async () => {
    const insert = await anon.from("orders").insert({
      pickup_number: randomInt(1_000_000_000, 2_000_000_000), payment_method: "cash", total_amount: 1,
      idempotency_key: randomUUID(), status_token: randomBytes(32).toString("hex"),
    });
    expect(insert.error).not.toBeNull();

    await anon.from("menu_items").update({ stock: 99 }).eq("id", menuId);
    await anon.from("orders").update({ total_amount: 1 }).eq("id", orderId);
    await anon.from("app_settings").delete().eq("key", settingKey);

    const menu = await must("메뉴 확인", service.from("menu_items").select("stock").eq("id", menuId).single());
    const setting = await must("설정 확인", service.from("app_settings").select("value").eq("key", settingKey));
    expect(menu.stock).toBe(1);
    expect((await orderRow()).total_amount).toBe(1000);
    expect(setting).toEqual([{ value: "before" }]);
  });

  test("DB 함수(create_order·transition_order)를 실행하지 못한다", async () => {
    if (await functionExists("create_order", { ...createOrderArgs, p_idempotency_key: randomUUID() })) {
      const { error } = await anon.rpc("create_order", createOrderArgs);
      expect(error).not.toBeNull();
    }
    if (await functionExists("transition_order", { ...transitionArgs, p_order_id: randomUUID() })) {
      const { error } = await anon.rpc("transition_order", transitionArgs);
      expect(error).not.toBeNull();
      expect((await orderRow()).status).toBe("pending");
    }
  });
});

describe("로그인한 관리자(authenticated) 클라이언트", () => {
  test("counters를 뺀 11개 테이블은 읽을 수 있고, counters는 읽지 못한다", async () => {
    const readable = TABLES.filter((table) => table !== "counters");
    for (const table of readable) {
      const { error } = await admin.from(table).select("*").limit(1);
      expect({ table, error }).toEqual({ table, error: null });
    }
    const orders = await must("관리자 주문 조회", admin.from("orders").select("id").eq("id", orderId));
    expect(orders).toEqual([{ id: orderId }]);
    expect(await blockedReads(admin, ["counters"])).toEqual([]);
  });

  test("쓰기는 모두 막힌다(쓰기는 서버 service_role만)", async () => {
    const insert = await admin.from("orders").insert({
      pickup_number: randomInt(1_000_000_000, 2_000_000_000), payment_method: "cash", total_amount: 1,
      idempotency_key: randomUUID(), status_token: randomBytes(32).toString("hex"),
    });
    expect(insert.error).not.toBeNull();

    await admin.from("orders").update({ total_amount: 1, status: "paid" }).eq("id", orderId);
    await admin.from("orders").delete().eq("id", orderId);
    await admin.from("app_settings").update({ value: "after" }).eq("key", settingKey);
    await admin.from("menu_items").update({ stock: 99 }).eq("id", menuId);

    expect(await orderRow()).toEqual({ status: "pending", total_amount: 1000 });
    const setting = await must("설정 확인", service.from("app_settings").select("value").eq("key", settingKey));
    const menu = await must("메뉴 확인", service.from("menu_items").select("stock").eq("id", menuId).single());
    expect(setting).toEqual([{ value: "before" }]);
    expect(menu.stock).toBe(1);
  });

  test("DB 함수도 직접 실행하지 못한다(Route Handler의 service_role만)", async () => {
    if (await functionExists("create_order", { ...createOrderArgs, p_idempotency_key: randomUUID() })) {
      const { error } = await admin.rpc("create_order", createOrderArgs);
      expect(error).not.toBeNull();
    }
    if (await functionExists("transition_order", { ...transitionArgs, p_order_id: randomUUID() })) {
      const { error } = await admin.rpc("transition_order", transitionArgs);
      expect(error).not.toBeNull();
      expect((await orderRow()).status).toBe("pending");
    }
  });
});
