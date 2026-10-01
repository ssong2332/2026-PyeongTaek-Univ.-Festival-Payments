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
const optionGroupId = randomUUID();
const optionId = randomUUID();
const orderId = randomUUID();
const orderItemId = randomUUID();
const settingKey = `t13.${randomUUID()}`;
const counterKey = `t13-${randomUUID()}`;
const adminEmail = `t13-${randomUUID()}@example.test`;
const adminPassword = `T13-${randomUUID()}`;
let adminUserId: string | undefined;

// 12개 테이블마다 이 테스트가 넣은 행을 정확히 가리키는 조건.
// "0행"이 테이블이 비어서가 아니라 권한 때문임을 보장하려고, 모든 읽기 검사를 이 행 기준으로 한다.
const FIXTURE_ROWS: ReadonlyArray<{ table: (typeof TABLES)[number]; column: string; value: string }> = [
  { table: "menu_items", column: "id", value: menuId },
  { table: "menu_item_translations", column: "menu_item_id", value: menuId },
  { table: "option_groups", column: "id", value: optionGroupId },
  { table: "option_group_translations", column: "option_group_id", value: optionGroupId },
  { table: "options", column: "id", value: optionId },
  { table: "option_translations", column: "option_id", value: optionId },
  { table: "counters", column: "key", value: counterKey },
  { table: "orders", column: "id", value: orderId },
  { table: "order_items", column: "id", value: orderItemId },
  { table: "order_item_options", column: "order_item_id", value: orderItemId },
  { table: "order_status_history", column: "order_id", value: orderId },
  { table: "app_settings", column: "key", value: settingKey },
];

async function must<T>(label: string, promise: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label} 실패: ${JSON.stringify(error)}`);
  return data as NonNullable<T>;
}

function expectFunctionExecutionDenied(
  error: { code?: string; message?: string } | null,
  functionName: "create_order" | "transition_order",
): void {
  expect(error).not.toBeNull();
  expect(error?.code).toBe("42501");
  expect(error?.message).toContain("permission denied for function");
  expect(error?.message).toContain(functionName);
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
  await must("옵션 그룹 준비", service.from("option_groups")
    .insert({ id: optionGroupId, menu_item_id: menuId, min_select: 0, max_select: 1 }));
  await must("옵션 그룹 번역 준비", service.from("option_group_translations")
    .insert({ option_group_id: optionGroupId, locale: "ko", name: "T-13 토핑" }));
  await must("옵션 준비", service.from("options")
    .insert({ id: optionId, option_group_id: optionGroupId, extra_price: 0 }));
  await must("옵션 번역 준비", service.from("option_translations")
    .insert({ option_id: optionId, locale: "ko", name: "T-13 치즈" }));
  await must("주문 준비", service.from("orders").insert({
    id: orderId, pickup_number: randomInt(1_000_000_000, 2_000_000_000), payment_method: "cash",
    total_amount: 1000, idempotency_key: randomUUID(), status_token: randomBytes(32).toString("hex"),
  }));
  await must("주문 항목 준비", service.from("order_items").insert({
    id: orderItemId, order_id: orderId, menu_item_id: menuId, menu_name_ko: "T-13 검증 메뉴",
    unit_price: 1000, quantity: 1, options_price: 0, line_total: 1000,
  }));
  await must("주문 항목 옵션 준비", service.from("order_item_options").insert({
    order_item_id: orderItemId, option_id: optionId, option_group_name_ko: "T-13 토핑",
    option_name_ko: "T-13 치즈", extra_price: 0,
  }));
  await must("상태 이력 준비", service.from("order_status_history").insert({
    order_id: orderId, from_status: null, to_status: "pending", action: "create", actor_type: "customer",
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
  // 주문을 먼저 지워야 항목·항목 옵션·이력(CASCADE)이 사라지고, 메뉴·옵션의 RESTRICT FK가 풀린다.
  await service.from("orders").delete().eq("id", orderId);
  await service.from("menu_items").delete().eq("id", menuId);
  await service.from("app_settings").delete().eq("key", settingKey);
  await service.from("counters").delete().eq("key", counterKey);
  if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
});

async function orderRow() {
  return must("주문 확인", service.from("orders").select("status, total_amount").eq("id", orderId).single());
}

// 준비한 행을 클라이언트가 읽어 오면 누수로 본다(에러 또는 0행이면 막힌 것).
async function blockedReads(client: SupabaseClient, tables: readonly string[]): Promise<string[]> {
  const leaks: string[] = [];
  for (const { table, column, value } of FIXTURE_ROWS.filter((row) => tables.includes(row.table))) {
    const { data, error } = await client.from(table).select("*").eq(column, value);
    if (!error && (data ?? []).length > 0) leaks.push(table);
  }
  return leaks;
}

describe("검증 데이터 준비", () => {
  test("12개 테이블 모두 이 테스트의 행이 1개 이상 있다(service_role 기준)", async () => {
    const missing: string[] = [];
    for (const { table, column, value } of FIXTURE_ROWS) {
      const rows = await must(`${table} 준비 확인`, service.from(table).select("*").eq(column, value));
      if (rows.length === 0) missing.push(table);
    }
    expect(missing).toEqual([]);
    expect(FIXTURE_ROWS.map((row) => row.table).sort()).toEqual([...TABLES].sort());
  });
});

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

  test("DB 함수(create_order·transition_order)를 실제 EXECUTE 권한에서 거부한다", async () => {
    const createOrder = await anon.rpc("create_order", createOrderArgs);
    expectFunctionExecutionDenied(createOrder.error, "create_order");

    const transitionOrder = await anon.rpc("transition_order", transitionArgs);
    expectFunctionExecutionDenied(transitionOrder.error, "transition_order");
    expect((await orderRow()).status).toBe("pending");
  });
});

describe("로그인한 관리자(authenticated) 클라이언트", () => {
  test("counters를 뺀 11개 테이블은 읽을 수 있고, counters는 읽지 못한다", async () => {
    for (const { table, column, value } of FIXTURE_ROWS.filter((row) => row.table !== "counters")) {
      const { data, error } = await admin.from(table).select("*").eq(column, value);
      expect({ table, error, found: (data ?? []).length > 0 }).toEqual({ table, error: null, found: true });
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

  test("DB 함수도 실제 EXECUTE 권한에서 거부한다(Route Handler의 service_role만)", async () => {
    const createOrder = await admin.rpc("create_order", createOrderArgs);
    expectFunctionExecutionDenied(createOrder.error, "create_order");

    const transitionOrder = await admin.rpc("transition_order", transitionArgs);
    expectFunctionExecutionDenied(transitionOrder.error, "transition_order");
    expect((await orderRow()).status).toBe("pending");
  });
});
