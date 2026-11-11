import { afterEach, describe, expect, test } from "vitest";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { getMenu } from "@/services/menuService";

const db = createServiceClient();
const adminRepo = createSupabaseAdminMenuRepository(db);
const customerRepo = createSupabaseMenuRepository(db);
const createdMenuIds: string[] = [];

const input = (name = "T37 원자 생성 호떡") => ({
    basePrice: 3200,
    stock: 12,
    sortOrder: 9000,
    translations: [
        { locale: "ko", name, description: "원자 생성 테스트" },
        { locale: "en", name: "Atomic Hotteok", description: "Atomic creation test" },
    ],
    optionGroups: [{
        minSelect: 0,
        maxSelect: 1,
        sortOrder: 0,
        translations: [
            { locale: "ko", name: "토핑" },
            { locale: "en", name: "Topping" },
        ],
        options: [{
            extraPrice: 500,
            sortOrder: 0,
            translations: [
                { locale: "ko", name: "치즈" },
                { locale: "en", name: "Cheese" },
            ],
        }],
    }],
});

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw error;
    return data as T;
}

afterEach(async () => {
    if (createdMenuIds.length) {
        await must(db.from("menu_items").delete().in("id", createdMenuIds.splice(0)));
    }
});

describe("T-37 관리자 메뉴 신규 등록", () => {
    test("메뉴·ko/en 번역·옵션 그룹·옵션을 RPC 한 번으로 생성한다", async () => {
        const id = await adminRepo.createMenuItem(input());
        createdMenuIds.push(id);

        const created = await adminRepo.getMenuItem(id);
        expect(created).toMatchObject({
            id,
            basePrice: 3200,
            stock: 12,
            isActive: true,
            isRecommended: false,
            translations: expect.arrayContaining([
                expect.objectContaining({ locale: "ko", name: "T37 원자 생성 호떡" }),
                expect.objectContaining({ locale: "en", name: "Atomic Hotteok" }),
            ]),
        });
        expect(created?.optionGroups).toHaveLength(1);
        expect(created?.optionGroups[0]).toMatchObject({ minSelect: 0, maxSelect: 1, isActive: true });
        expect(created?.optionGroups[0].options).toHaveLength(1);
        expect(created?.optionGroups[0].options[0]).toMatchObject({ extraPrice: 500, isActive: true });
    });

    test("RPC 중간 실패 시 처음 만든 menu_items까지 모두 롤백한다", async () => {
        const sentinel = `T37-rollback-${Date.now()}`;
        const { error } = await db.rpc("create_admin_menu", {
            p_base_price: 1000,
            p_stock: 1,
            p_sort_order: 9999,
            // 같은 locale 두 번 → 첫 번역 INSERT 뒤 PK 충돌. RPC 전체가 롤백되어야 한다.
            p_translations: [
                { locale: "ko", name: sentinel, description: null },
                { locale: "ko", name: `${sentinel}-duplicate`, description: null },
            ],
            p_option_groups: [],
        });
        expect(error).not.toBeNull();

        const rows = await must<{ menu_item_id: string }[]>(db.from("menu_item_translations")
            .select("menu_item_id")
            .eq("name", sentinel));
        expect(rows).toEqual([]);
    });

    test("판매 종료는 row를 보존하고 고객 메뉴판에서만 숨긴다", async () => {
        const id = await adminRepo.createMenuItem(input("T37 판매종료 호떡"));
        createdMenuIds.push(id);

        expect(await adminRepo.updateMenuItem(id, { isActive: false })).toBe(true);
        const adminMenu = await adminRepo.getMenuItem(id);
        expect(adminMenu).toMatchObject({ id, isActive: false });

        const customerMenu = await getMenu("ko", {
            menuRepository: customerRepo,
            orderRepository: { countWaitingBefore: async () => 0 },
        });
        expect(customerMenu.items.some((item) => item.id === id)).toBe(false);
    });
});
