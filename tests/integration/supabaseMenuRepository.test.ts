import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { getMenu } from "@/services/menuService";
import type { MenuItemRecord } from "@/services/ports";

// GET /api/menu의 저장소 조회(PostgREST 임베드)가 실제 스키마에서 번역·옵션 그룹·옵션을 맞게 가져오는지 본다.
// 다른 테스트 파일이 만든 메뉴가 남아 있을 수 있으므로 이 파일이 만든 ID로만 단언하고, 끝나면 메뉴를 지운다(CASCADE).
const db = createServiceClient();
const menuRepository = createSupabaseMenuRepository(db);

const ids = {
    menu: randomUUID(),
    inactiveMenu: randomUUID(),
    group: randomUUID(),
    inactiveGroup: randomUUID(),
    option: randomUUID(),
    koOnlyOption: randomUUID(),
    inactiveOption: randomUUID(),
};

// 여러 행을 한 번에 넣을 때 빠진 키는 NULL이 되므로(supabase-js defaultToNull) 행마다 같은 키를 쓴다.
async function insert(table: string, rows: Record<string, unknown>[]) {
    const { error } = await db.from(table).insert(rows);
    if (error) throw error;
}

function byKey<T>(list: T[], key: (item: T) => string): T[] {
    return [...list].sort((a, b) => key(a).localeCompare(key(b)));
}

// 임베드 배열의 순서는 보장되지 않으므로 locale·id 순으로 맞춰 비교한다.
function normalized(record: MenuItemRecord): MenuItemRecord {
    return {
        ...record,
        translations: byKey(record.translations, (t) => t.locale),
        optionGroups: byKey(record.optionGroups, (g) => g.id).map((g) => ({
            ...g,
            translations: byKey(g.translations, (t) => t.locale),
            options: byKey(g.options, (o) => o.id).map((o) => ({
                ...o,
                translations: byKey(o.translations, (t) => t.locale),
            })),
        })),
    };
}

beforeAll(async () => {
    await insert("menu_items", [
        { id: ids.menu, base_price: 3000, stock: 5, is_recommended: true, is_sold_out_manual: false, is_active: true, sort_order: 1, image_url: "https://example.com/hotteok.png" },
        { id: ids.inactiveMenu, base_price: 1000, stock: 5, is_recommended: false, is_sold_out_manual: false, is_active: false, sort_order: 2, image_url: null },
    ]);
    await insert("menu_item_translations", [
        { menu_item_id: ids.menu, locale: "ko", name: "통합 호떡", description: "통합 설명" },
        { menu_item_id: ids.menu, locale: "en", name: "Integration Hotteok", description: null },
        { menu_item_id: ids.inactiveMenu, locale: "ko", name: "비활성 호떡", description: null },
    ]);
    await insert("option_groups", [
        { id: ids.group, menu_item_id: ids.menu, min_select: 1, max_select: 2, sort_order: 1, is_active: true },
        { id: ids.inactiveGroup, menu_item_id: ids.menu, min_select: 0, max_select: 1, sort_order: 0, is_active: false },
    ]);
    await insert("option_group_translations", [
        { option_group_id: ids.group, locale: "ko", name: "토핑" },
        { option_group_id: ids.group, locale: "en", name: "Topping" },
        { option_group_id: ids.inactiveGroup, locale: "ko", name: "소스" },
    ]);
    await insert("options", [
        { id: ids.option, option_group_id: ids.group, extra_price: 500, sort_order: 2, is_active: true },
        { id: ids.koOnlyOption, option_group_id: ids.group, extra_price: 0, sort_order: 1, is_active: true },
        { id: ids.inactiveOption, option_group_id: ids.group, extra_price: 300, sort_order: 0, is_active: false },
    ]);
    await insert("option_translations", [
        { option_id: ids.option, locale: "ko", name: "치즈" },
        { option_id: ids.option, locale: "en", name: "Cheese" },
        { option_id: ids.koOnlyOption, locale: "ko", name: "꿀" },
        { option_id: ids.inactiveOption, locale: "ko", name: "견과류" },
    ]);
});

afterAll(async () => {
    await db.from("menu_items").delete().in("id", [ids.menu, ids.inactiveMenu]);
});

describe("supabaseMenuRepository.listMenuItems — 실제 DB", () => {
    test("메뉴의 모든 언어 번역과 옵션 그룹·옵션(비활성 포함)을 한 번에 가져온다", async () => {
        const records = await menuRepository.listMenuItems();
        const record = records.find((item) => item.id === ids.menu);

        expect(record).toBeDefined();
        expect(normalized(record!)).toEqual(normalized({
            id: ids.menu,
            basePrice: 3000,
            stock: 5,
            isRecommended: true,
            isSoldOutManual: false,
            isActive: true,
            sortOrder: 1,
            imageUrl: "https://example.com/hotteok.png",
            translations: [
                { locale: "ko", name: "통합 호떡", description: "통합 설명" },
                { locale: "en", name: "Integration Hotteok", description: null },
            ],
            optionGroups: [
                {
                    id: ids.group,
                    minSelect: 1,
                    maxSelect: 2,
                    sortOrder: 1,
                    isActive: true,
                    translations: [{ locale: "ko", name: "토핑" }, { locale: "en", name: "Topping" }],
                    options: [
                        { id: ids.option, extraPrice: 500, sortOrder: 2, isActive: true, translations: [{ locale: "ko", name: "치즈" }, { locale: "en", name: "Cheese" }] },
                        { id: ids.koOnlyOption, extraPrice: 0, sortOrder: 1, isActive: true, translations: [{ locale: "ko", name: "꿀" }] },
                        { id: ids.inactiveOption, extraPrice: 300, sortOrder: 0, isActive: false, translations: [{ locale: "ko", name: "견과류" }] },
                    ],
                },
                {
                    id: ids.inactiveGroup,
                    minSelect: 0,
                    maxSelect: 1,
                    sortOrder: 0,
                    isActive: false,
                    translations: [{ locale: "ko", name: "소스" }],
                    options: [],
                },
            ],
        }));
        expect(records.find((item) => item.id === ids.inactiveMenu)).toMatchObject({ isActive: false, optionGroups: [] });
    });

    test("getMenu(en): 비활성 메뉴·그룹·옵션은 빠지고, en 없는 옵션·설명은 ko로, 옵션은 sort_order 순", async () => {
        const menu = await getMenu("en", { menuRepository, orderRepository: createSupabaseOrderRepository(db) });

        expect(menu.locale).toBe("en");
        expect(menu.items.find((item) => item.id === ids.inactiveMenu)).toBeUndefined();
        expect(menu.items.find((item) => item.id === ids.menu)).toEqual({
            id: ids.menu,
            name: "Integration Hotteok",
            description: "통합 설명",
            price: 3000,
            stock: 5,
            isRecommended: true,
            isAvailable: true,
            isSoldOut: false,
            imageUrl: "https://example.com/hotteok.png",
            optionGroups: [{
                id: ids.group,
                name: "Topping",
                minSelect: 1,
                maxSelect: 2,
                options: [
                    { id: ids.koOnlyOption, name: "꿀", extraPrice: 0 },
                    { id: ids.option, name: "Cheese", extraPrice: 500 },
                ],
            }],
        });

        // waitingCount = 전체 미완료 수(pending·paid·cooking). 파일 직렬 실행이라 그사이 주문이 바뀌지 않는다.
        const { count, error } = await db.from("orders")
            .select("id", { count: "exact", head: true })
            .in("status", ["pending", "paid", "cooking"]);
        if (error) throw error;
        expect(menu.waitingCount).toBe(count);
    });
});
