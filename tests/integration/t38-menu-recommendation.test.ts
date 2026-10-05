import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { listAdminMenus, updateAdminMenu } from "@/services/adminMenuService";
import { getMenu } from "@/services/menuService";

const db = createServiceClient();
const ids = [randomUUID(), randomUUID()];
const prefix = `t38-${randomUUID()}`;
let userId: string | undefined;
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_ANON_KEY!;
const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const anon = createClient(url, key, { auth });
const admin = createClient(url, key, { auth });

beforeAll(async () => {
    const inserted = await db.from("menu_items").insert(ids.map((id) => ({ id, base_price: 3000, stock: 5 })));
    if (inserted.error) throw inserted.error;
    const translated = await db.from("menu_item_translations").insert(ids.map((id, index) => ({
        menu_item_id: id, locale: "ko", name: `통합 추천 호떡 ${index + 1}`,
    })));
    if (translated.error) throw translated.error;
    const email = `${prefix}@example.test`;
    const password = randomUUID();
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    const signedIn = await admin.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
});

afterAll(async () => {
    const removed = await db.from("menu_items").delete().in("id", ids);
    if (removed.error) throw removed.error;
    if (userId) {
        const removedUser = await db.auth.admin.deleteUser(userId);
        if (removedUser.error) throw removedUser.error;
    }
});

test("추천 값을 생략한 신규 메뉴는 false", async () => {
    const rows = await db.from("menu_items").select("id, is_recommended").in("id", ids);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(ids.length);
    expect(rows.data!.every((row) => row.is_recommended === false)).toBe(true);
});

test("추천 ON/OFF는 가격·재고·활성·수동 품절 상태를 보존", async () => {
    for (const recommended of [true, false]) {
        const changed = await db.from("menu_items").update({ is_recommended: recommended }).eq("id", ids[0])
            .select("is_recommended, base_price, stock, is_active, is_sold_out_manual").single();
        expect(changed.error).toBeNull();
        expect(changed.data).toEqual({
            is_recommended: recommended, base_price: 3000, stock: 5, is_active: true, is_sold_out_manual: false,
        });
    }
});

test("관리자 메뉴 저장 서비스에서 추천 값을 저장하고 재조회한다", async () => {
    const repository = createSupabaseAdminMenuRepository(db);
    const enabled = await updateAdminMenu(ids[0], { isRecommended: true }, repository);
    expect(enabled).toMatchObject({ isRecommended: true, basePrice: 3000, stock: 5, isSoldOutManual: false });
    const listed = await listAdminMenus(repository);
    expect(listed.menus.find((menu) => menu.id === ids[0])?.isRecommended).toBe(true);
    const disabled = await updateAdminMenu(ids[0], { isRecommended: false }, repository);
    expect(disabled.isRecommended).toBe(false);
});

test("관리자 추천 ON/OFF가 고객 메뉴 조회에 반영되고 0개도 유지된다", async () => {
    const adminRepository = createSupabaseAdminMenuRepository(db);
    const customerRepository = createSupabaseMenuRepository(db);
    const orderRepository = { countWaitingBefore: async () => 0 };
    await updateAdminMenu(ids[0], { isRecommended: true }, adminRepository);
    const enabled = await getMenu("ko", { menuRepository: customerRepository, orderRepository });
    expect(enabled.items.find((item) => item.id === ids[0])?.isRecommended).toBe(true);
    expect(enabled.items.find((item) => item.id === ids[1])?.isRecommended).toBe(false);
    await updateAdminMenu(ids[0], { isRecommended: false }, adminRepository);
    const disabled = await getMenu("ko", { menuRepository: customerRepository, orderRepository });
    expect(disabled.items.filter((item) => ids.some((id) => id === item.id)).every((item) => !item.isRecommended)).toBe(true);
});

test("추천 메뉴는 여러 개 또는 0개를 허용", async () => {
    const enabled = await db.from("menu_items").update({ is_recommended: true }).in("id", ids);
    expect(enabled.error).toBeNull();
    const recommended = await db.from("menu_items").select("id").in("id", ids).eq("is_recommended", true);
    expect(recommended.error).toBeNull();
    expect(recommended.data).toHaveLength(2);
    const disabled = await db.from("menu_items").update({ is_recommended: false }).in("id", ids);
    expect(disabled.error).toBeNull();
    const empty = await db.from("menu_items").select("id").in("id", ids).eq("is_recommended", true);
    expect(empty.error).toBeNull();
    expect(empty.data).toEqual([]);
});

test("NULL은 신규 등록과 수정 모두 거부하고 기존 값을 유지", async () => {
    const invalid = await db.from("menu_items").insert({ id: ids[0], base_price: 1000, is_recommended: null });
    expect(invalid.error?.code).toBe("23502");
    const update = await db.from("menu_items").update({ is_recommended: null }).eq("id", ids[0]);
    expect(update.error?.code).toBe("23502");
    const row = await db.from("menu_items").select("is_recommended").eq("id", ids[0]).single();
    expect(row.error).toBeNull();
    expect(row.data?.is_recommended).toBe(false);
});

test("anon 조회·변경 및 authenticated 직접 변경은 거부, 관리자 조회는 허용", async () => {
    const anonymousRead = await anon.from("menu_items").select("id, is_recommended").eq("id", ids[0]);
    expect(anonymousRead.error?.code).toBe("42501");
    const adminRead = await admin.from("menu_items").select("id, is_recommended").eq("id", ids[0]).single();
    expect(adminRead.error).toBeNull();
    expect(adminRead.data).toEqual({ id: ids[0], is_recommended: false });
    for (const client of [anon, admin]) {
        const update = await client.from("menu_items").update({ is_recommended: true }).eq("id", ids[0]);
        expect(update.error?.code).toBe("42501");
    }
    const row = await db.from("menu_items").select("is_recommended").eq("id", ids[0]).single();
    expect(row.error).toBeNull();
    expect(row.data?.is_recommended).toBe(false);
});
