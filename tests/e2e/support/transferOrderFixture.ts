import { randomBytes, randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveE2eSupabase } from "./localSupabase";

// T-24 시나리오용 준비 데이터(메뉴 1개·계좌 설정·관리자 계정)를 로컬 DB에 넣고, 끝나면 만든 것만 되돌린다.
// 관리자 계정은 seed가 아니라 로컬 Auth Admin API로 만든다(ADR-0007) — 비밀번호는 실행마다 새로 만들어 어디에도 남기지 않는다.
const TRANSFER = {
    "transfer.bank_name": "테스트은행",
    "transfer.account_number": "000-0000-0000",
    "transfer.account_holder": "E2E테스트",
} as const;
const TRANSFER_KEYS = Object.keys(TRANSFER);
const PRICE = 2000;
const STOCK = 5;

export type TransferOrderScenario = {
    db: SupabaseClient;
    menu: { id: string; name: string; price: number; stock: number };
    transfer: { bankName: string; accountNumber: string; accountHolder: string };
    admin: { id: string; email: string; password: string };
};

type Row = Record<string, unknown>;

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw error;
    return data as T;
}

const rateKey = (row: Row) => `${row.scope}|${row.key}|${row.window_start}`;

export const test = base.extend<{ scenario: TransferOrderScenario }>({
    // 둘째 인자는 Playwright의 `use`다 — 그 이름이면 React 훅 lint 규칙에 걸려서 provide로 받는다.
    scenario: async ({}, provide) => {
        // 설정 파일에서 이미 확인했지만, DB에 쓰기 직전에 한 번 더 확인한다.
        const supabase = resolveE2eSupabase();
        const db = createClient(supabase.url, supabase.serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const suffix = randomBytes(3).toString("hex");
        const menuId = randomUUID();
        const menuName = `E2E 호떡 ${suffix}`;
        let adminId: string | null = null;

        // 되돌릴 기준값: 계좌 설정, 픽업 번호 카운터, 속도 제한 기록
        const settingsBefore = await must<Row[]>(db.from("app_settings").select("key, value, updated_by").in("key", TRANSFER_KEYS));
        const counterBefore = await must<Row | null>(db.from("counters").select("value").eq("key", "pickup_number").maybeSingle());
        const rateBefore = new Map((await must<Row[]>(db.from("rate_limits").select("scope, key, window_start, count")))
            .map((row) => [rateKey(row), row]));

        try {
            await must(db.from("menu_items").insert({ id: menuId, base_price: PRICE, stock: STOCK, sort_order: 9999 }));
            await must(db.from("menu_item_translations").insert({
                menu_item_id: menuId, locale: "ko", name: menuName, description: "T-24 E2E 전용 메뉴",
            }));
            await must(db.from("app_settings").upsert(
                Object.entries(TRANSFER).map(([key, value]) => ({ key, value, updated_by: null })),
            ));

            const email = `e2e-admin-${suffix}@example.com`;
            const password = randomBytes(18).toString("base64url");
            const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
            if (created.error || !created.data.user) throw created.error ?? new Error("관리자 계정을 만들지 못했습니다.");
            adminId = created.data.user.id;

            await provide({
                db,
                menu: { id: menuId, name: menuName, price: PRICE, stock: STOCK },
                transfer: {
                    bankName: TRANSFER["transfer.bank_name"],
                    accountNumber: TRANSFER["transfer.account_number"],
                    accountHolder: TRANSFER["transfer.account_holder"],
                },
                admin: { id: adminId, email, password },
            });
        } finally {
            // 주문 → 메뉴 순서로 지운다(order_items.menu_item_id가 ON DELETE RESTRICT). 재고는 이 메뉴에만 걸려 있어 함께 사라진다.
            const lines = await must<Row[]>(db.from("order_items").select("order_id").eq("menu_item_id", menuId));
            const orderIds = [...new Set(lines.map((line) => line.order_id as string))];
            let lastPickup: number | null = null;
            if (orderIds.length) {
                const orders = await must<Row[]>(db.from("orders").select("pickup_number").in("id", orderIds));
                lastPickup = Math.max(...orders.map((order) => order.pickup_number as number));
                await must(db.from("orders").delete().in("id", orderIds));
            }
            await must(db.from("menu_items").delete().eq("id", menuId));

            // 픽업 번호: 이 테스트가 마지막으로 쓴 번호 그대로일 때만 되돌린다(그 사이 다른 주문이 있었다면 건드리지 않는다).
            if (lastPickup !== null) {
                if (counterBefore) {
                    await must(db.from("counters").update({ value: counterBefore.value }).eq("key", "pickup_number").eq("value", lastPickup));
                } else {
                    await must(db.from("counters").delete().eq("key", "pickup_number").eq("value", lastPickup));
                }
            }

            const before = new Map(settingsBefore.map((row) => [row.key as string, row]));
            const missing = TRANSFER_KEYS.filter((key) => !before.has(key));
            if (missing.length) await must(db.from("app_settings").delete().in("key", missing));
            if (settingsBefore.length) await must(db.from("app_settings").upsert(settingsBefore));

            // 속도 제한: 테스트 중 새로 생긴 기록은 지우고, 늘어난 횟수는 원래 값으로 돌린다.
            for (const row of await must<Row[]>(db.from("rate_limits").select("scope, key, window_start, count"))) {
                const previous = rateBefore.get(rateKey(row));
                const target = db.from("rate_limits");
                if (!previous) {
                    await must(target.delete().eq("scope", row.scope).eq("key", row.key).eq("window_start", row.window_start));
                } else if (previous.count !== row.count) {
                    await must(target.update({ count: previous.count }).eq("scope", row.scope).eq("key", row.key).eq("window_start", row.window_start));
                }
            }

            if (adminId) {
                const removed = await db.auth.admin.deleteUser(adminId);
                if (removed.error) throw removed.error;
            }
        }
    },
});

export { expect };
