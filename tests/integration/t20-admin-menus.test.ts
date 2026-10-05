import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { listAdminMenus, updateAdminMenu, updateAdminOption, updateAdminOptionGroup } from "@/services/adminMenuService";
import { getMenu } from "@/services/menuService";

// T-20 메뉴·재고 관리 저장 경로(F-25·F-26·F-27): adminMenuService → adminMenuRepository → 실제 DB.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증·본문 검사는 Route Handler 경계라
// 단위 테스트(tests/unit/api/adminMenusRoute.test.ts)가 맡는다. 시드 메뉴를 건드리지 않게 임시 메뉴를 만들고 지운다.
const db = createServiceClient();
const repository = createSupabaseAdminMenuRepository(db);
const menuId = randomUUID();
const groupId = randomUUID();
const optionId = randomUUID();
const queue = { countWaitingBefore: async () => 0 };

async function customerItem() {
    const { items } = await getMenu("ko", { menuRepository: createSupabaseMenuRepository(db), orderRepository: queue });
    return items.find((item) => item.id === menuId);
}

beforeAll(async () => {
    const steps = [
        await db.from("menu_items").insert({ id: menuId, base_price: 2000, stock: 3, sort_order: 999 }),
        await db.from("menu_item_translations").insert([
            { menu_item_id: menuId, locale: "ko", name: "T20 호떡", description: "설명" },
            { menu_item_id: menuId, locale: "en", name: "T20 Hotteok", description: "Desc" },
        ]),
        await db.from("option_groups").insert({ id: groupId, menu_item_id: menuId, min_select: 0, max_select: 2 }),
        await db.from("option_group_translations").insert({ option_group_id: groupId, locale: "ko", name: "토핑" }),
        await db.from("options").insert({ id: optionId, option_group_id: groupId, extra_price: 500 }),
        await db.from("option_translations").insert({ option_id: optionId, locale: "ko", name: "치즈" }),
    ];
    for (const step of steps) if (step.error) throw step.error;
});

afterAll(async () => {
    const removed = await db.from("menu_items").delete().eq("id", menuId);
    if (removed.error) throw removed.error;
});

test("목록에 임시 메뉴가 언어별 번역·옵션과 함께 들어 있다", async () => {
    const { menus } = await listAdminMenus(repository);
    const menu = menus.find((item) => item.id === menuId);
    expect(menu).toMatchObject({
        basePrice: 2000,
        stock: 3,
        isSoldOutManual: false,
        translations: { ko: { name: "T20 호떡", description: "설명" }, en: { name: "T20 Hotteok", description: "Desc" } },
        optionGroups: [{ id: groupId, minSelect: 0, maxSelect: 2, options: [{ id: optionId, extraPrice: 500, isActive: true }] }],
    });
});

test("재고 0 → 고객 메뉴판 품절, 재고 회복 → 해제(F-25)", async () => {
    await updateAdminMenu(menuId, { stock: 0 }, repository);
    expect(await customerItem()).toMatchObject({ stock: 0, isSoldOut: true, isAvailable: false });

    await updateAdminMenu(menuId, { stock: 5 }, repository);
    expect(await customerItem()).toMatchObject({ stock: 5, isSoldOut: false, isAvailable: true });
});

test("수동 품절 토글은 재고와 무관하게 품절/판매중(F-26)", async () => {
    await updateAdminMenu(menuId, { isSoldOutManual: true }, repository);
    expect(await customerItem()).toMatchObject({ isSoldOut: true });
    await updateAdminMenu(menuId, { isSoldOutManual: false }, repository);
    expect(await customerItem()).toMatchObject({ isSoldOut: false });
});

test("가격·이름을 바꾸면 고객 메뉴판에 반영되고, 설명을 보내지 않은 언어는 설명을 지킨다(F-27)", async () => {
    const updated = await updateAdminMenu(menuId, {
        basePrice: 2500,
        translations: { ko: { name: "T20 꿀호떡", description: "" }, en: { name: "T20 Honey" } },
    }, repository);

    expect(updated.translations).toEqual({ ko: { name: "T20 꿀호떡", description: null }, en: { name: "T20 Honey", description: "Desc" } });
    expect(await customerItem()).toMatchObject({ name: "T20 꿀호떡", price: 2500 });
});

test("옵션 추가 가격·이름·판매 여부, 그룹 최소/최대를 바꾼다", async () => {
    const afterOption = await updateAdminOption(optionId, { extraPrice: 700, translations: { en: { name: "Cheese" } } }, repository);
    expect(afterOption.optionGroups[0].options[0]).toEqual({
        id: optionId, translations: { ko: { name: "치즈" }, en: { name: "Cheese" } }, extraPrice: 700, isActive: true,
    });

    const afterGroup = await updateAdminOptionGroup(groupId, { minSelect: 1, maxSelect: 1 }, repository);
    expect(afterGroup.optionGroups[0]).toMatchObject({ minSelect: 1, maxSelect: 1 });

    await updateAdminOption(optionId, { isActive: false }, repository);
    expect((await customerItem())?.optionGroups[0].options).toEqual([]);
});

test("없는 메뉴·옵션은 404", async () => {
    await expect(updateAdminMenu(randomUUID(), { stock: 1 }, repository)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(updateAdminOption(randomUUID(), { extraPrice: 1 }, repository)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});
