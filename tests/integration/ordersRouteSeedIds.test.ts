import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import { POST } from "@/app/api/orders/route";
import { createServiceClient } from "@/infra/supabase/server";

// supabase/seed.sql(T-36)의 메뉴 ID는 RFC 9562 버전·variant 비트가 없는 값이다(11111111-…).
// z.uuid()로 검사하면 이런 ID는 API 입구에서 400이 되므로, 라우트부터 create_order까지 실제로 통과하는지 본다.
// CI의 supabase start는 시드를 넣지 않는다(config.toml [db.seed] enabled=false) — 같은 ID로 메뉴를 직접 만든다.
// 로컬에 시드가 이미 들어가 있으면 운영 데이터를 건드리지 않도록 건너뛴다.
const SEED_MENU_ID = "11111111-1111-1111-1111-111111111111";
// 옵션도 같은 모양(버전 1, variant 비트 불일치)의 고정 ID로 만든다. 시드에는 옵션이 없다.
const OPTION_ID = "12121212-1212-1212-1212-121212121212";

const db = createServiceClient();
const { data: existingMenu } = await db.from("menu_items").select("id").eq("id", SEED_MENU_ID).maybeSingle();
const seedAlreadyApplied = existingMenu !== null;

const createdKeys: string[] = [];
let createdMenu = false;

afterAll(async () => {
  if (createdKeys.length) await db.from("orders").delete().in("idempotency_key", createdKeys);
  if (createdMenu) await db.from("menu_items").delete().eq("id", SEED_MENU_ID);
});

async function post(payload: unknown) {
  const response = await POST(new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }));
  return { status: response.status, json: await response.json() };
}

describe.skipIf(seedAlreadyApplied)("POST /api/orders — 시드 메뉴 ID", () => {
  test("11111111-… 메뉴와 12121212-… 옵션으로 주문하면 201, 서버가 계산한 금액", async () => {
    const { error: menuError } = await db.from("menu_items")
      .insert({ id: SEED_MENU_ID, base_price: 2000, stock: 5, is_sold_out_manual: false });
    if (menuError) throw menuError;
    createdMenu = true;
    await db.from("menu_item_translations").insert({ menu_item_id: SEED_MENU_ID, locale: "ko", name: "기본호떡" });
    const { data: group, error: groupError } = await db.from("option_groups")
      .insert({ menu_item_id: SEED_MENU_ID, min_select: 0, max_select: 1 }).select("id").single();
    if (groupError) throw groupError;
    await db.from("option_group_translations").insert({ option_group_id: group.id, locale: "ko", name: "토핑" });
    const { error: optionError } = await db.from("options")
      .insert({ id: OPTION_ID, option_group_id: group.id, extra_price: 500 });
    if (optionError) throw optionError;
    await db.from("option_translations").insert({ option_id: OPTION_ID, locale: "ko", name: "치즈" });

    const idempotencyKey = randomUUID();
    createdKeys.push(idempotencyKey);
    const { status, json } = await post({
      idempotencyKey,
      paymentMethod: "cash",
      locale: "ko",
      items: [{ menuItemId: SEED_MENU_ID, quantity: 2, optionIds: [OPTION_ID] }],
    });

    expect(status).toBe(201);
    expect(json).toMatchObject({ status: "pending", totalAmount: 5000, created: true });
    const { data: items } = await db.from("order_items").select("menu_item_id").eq("order_id", json.orderId);
    expect(items).toEqual([{ menu_item_id: SEED_MENU_ID }]);
  });
});
