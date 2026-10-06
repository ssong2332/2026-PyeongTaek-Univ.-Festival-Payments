import { describe, expect, it } from "vitest";
import { AdminMenuSchema, AdminMenusResponseSchema } from "@/lib/dto/adminMenu";
import { AppError } from "@/lib/api/errors";
import { listAdminMenus, updateAdminMenu, updateAdminOption, updateAdminOptionGroup } from "@/services/adminMenuService";
import { getMenu } from "@/services/menuService";
import type { MenuItemRecord, MenuOptionGroupRecord } from "@/services/ports";
import { createFakeAdminMenuRepository } from "../fakes/fakeAdminMenuRepository";

const MENU_ID = "10000000-0000-4000-8000-000000000001";
const MENU_ID_2 = "10000000-0000-4000-8000-000000000002";
const GROUP_ID = "20000000-0000-4000-8000-000000000001";
const OPTION_ID = "30000000-0000-4000-8000-000000000001";
const OPTION_ID_2 = "30000000-0000-4000-8000-000000000002";
const MISSING_ID = "99999999-0000-4000-8000-000000000009";

function group(overrides: Partial<MenuOptionGroupRecord> = {}): MenuOptionGroupRecord {
    return {
        id: GROUP_ID,
        minSelect: 0,
        maxSelect: 2,
        sortOrder: 0,
        isActive: true,
        translations: [
            { locale: "ko", name: "토핑" },
            { locale: "en", name: "Topping" },
        ],
        options: [
            { id: OPTION_ID_2, extraPrice: 700, sortOrder: 1, isActive: false, translations: [{ locale: "ko", name: "견과" }] },
            { id: OPTION_ID, extraPrice: 500, sortOrder: 0, isActive: true, translations: [{ locale: "ko", name: "치즈" }, { locale: "en", name: "Cheese" }] },
        ],
        ...overrides,
    };
}

function menu(overrides: Partial<MenuItemRecord> = {}): MenuItemRecord {
    return {
        id: MENU_ID,
        basePrice: 2000,
        stock: 10,
        isRecommended: false,
        isSoldOutManual: false,
        isActive: true,
        sortOrder: 1,
        imageUrl: null,
        translations: [
            { locale: "ko", name: "기본 호떡", description: "꿀 호떡" },
            { locale: "en", name: "Original Hotteok", description: null },
        ],
        optionGroups: [group()],
        ...overrides,
    };
}

const queue = { countWaitingBefore: async () => 0 };

describe("listAdminMenus — GET /api/admin/menus", () => {
    it("비활성 메뉴까지 sort_order 순으로, 언어별 번역 맵·옵션(정렬)을 그대로 담는다", async () => {
        const { repository } = createFakeAdminMenuRepository([
            menu(),
            menu({ id: MENU_ID_2, sortOrder: 0, isActive: false, translations: [{ locale: "ko", name: "판매 종료 호떡", description: null }], optionGroups: [] }),
        ]);

        const result = await listAdminMenus(repository);

        expect(AdminMenusResponseSchema.parse(result)).toEqual(result);
        expect(result.menus.map((item) => item.id)).toEqual([MENU_ID_2, MENU_ID]);
        expect(result.menus[0].isActive).toBe(false);
        expect(result.menus[1]).toEqual({
            id: MENU_ID,
            translations: { ko: { name: "기본 호떡", description: "꿀 호떡" }, en: { name: "Original Hotteok", description: null } },
            basePrice: 2000,
            stock: 10,
            isRecommended: false,
            isSoldOutManual: false,
            isActive: true,
            sortOrder: 1,
            imageUrl: null,
            optionGroups: [{
                id: GROUP_ID,
                translations: { ko: { name: "토핑" }, en: { name: "Topping" } },
                minSelect: 0,
                maxSelect: 2,
                isActive: true,
                options: [
                    { id: OPTION_ID, translations: { ko: { name: "치즈" }, en: { name: "Cheese" } }, extraPrice: 500, isActive: true },
                    { id: OPTION_ID_2, translations: { ko: { name: "견과" } }, extraPrice: 700, isActive: false },
                ],
            }],
        });
    });

    it("메뉴가 0개면 빈 목록", async () => {
        const { repository } = createFakeAdminMenuRepository([]);
        expect(await listAdminMenus(repository)).toEqual({ menus: [] });
    });
});

describe("updateAdminMenu — PATCH /api/admin/menus/{id}", () => {
    it("추천 값만 바꾸고 가격·재고·품절 상태를 보존한다", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);
        const enabled = await updateAdminMenu(MENU_ID, { isRecommended: true }, repository);
        expect(enabled).toMatchObject({ isRecommended: true, basePrice: 2000, stock: 10, isSoldOutManual: false });
        const disabled = await updateAdminMenu(MENU_ID, { isRecommended: false }, repository);
        expect(disabled).toMatchObject({ isRecommended: false, basePrice: 2000, stock: 10, isSoldOutManual: false });
    });

    it("가격·재고·수동 품절·이름/설명을 바꾸고 고친 뒤의 메뉴를 돌려준다", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);

        const updated = await updateAdminMenu(MENU_ID, {
            basePrice: 2500,
            stock: 30,
            isSoldOutManual: true,
            translations: { ko: { name: "꿀 호떡", description: "" }, en: { name: "Honey Hotteok" } },
        }, repository);

        expect(AdminMenuSchema.parse(updated)).toEqual(updated);
        expect(updated).toMatchObject({ basePrice: 2500, stock: 30, isSoldOutManual: true });
        // 빈 설명은 지우고(null), 보내지 않은 en 설명은 그대로 둔다.
        expect(updated.translations).toEqual({ ko: { name: "꿀 호떡", description: null }, en: { name: "Honey Hotteok", description: null } });
    });

    it("보내지 않은 칸은 그대로 둔다(재고만 바꾸면 가격·이름 유지)", async () => {
        const { repository, calls } = createFakeAdminMenuRepository([menu()]);

        const updated = await updateAdminMenu(MENU_ID, { stock: 3 }, repository);

        expect(updated).toMatchObject({ stock: 3, basePrice: 2000, isSoldOutManual: false });
        expect(updated.translations.ko).toEqual({ name: "기본 호떡", description: "꿀 호떡" });
        expect(calls.filter((call) => call.startsWith("upsertMenuTranslation"))).toEqual([]);
    });

    it("없는 메뉴는 404 NOT_FOUND이고 번역을 쓰지 않는다", async () => {
        const { repository, calls } = createFakeAdminMenuRepository([menu()]);

        await expect(updateAdminMenu(MISSING_ID, { translations: { ko: { name: "새 이름" } } }, repository)).rejects.toMatchObject({
            code: "NOT_FOUND",
            status: 404,
        });
        expect(calls.some((call) => call.startsWith("upsertMenuTranslation"))).toBe(false);
    });

    // T-20 단위 테스트(Tasks): 재고 0 → 품절, 재고 회복 → 해제. 품절 플래그를 따로 저장하지 않고 고객 메뉴가 파생한다(F-25).
    it("재고를 0으로 바꾸면 고객 메뉴판에서 품절, 다시 채우면 판매 가능", async () => {
        const { repository, menuRepository } = createFakeAdminMenuRepository([menu()]);
        const customerMenu = async () => (await getMenu("ko", { menuRepository, orderRepository: queue })).items[0];

        expect(await customerMenu()).toMatchObject({ isSoldOut: false, isAvailable: true });

        const zero = await updateAdminMenu(MENU_ID, { stock: 0 }, repository);
        expect(zero).toMatchObject({ stock: 0, isSoldOutManual: false });
        expect(await customerMenu()).toMatchObject({ stock: 0, isSoldOut: true, isAvailable: false });

        await updateAdminMenu(MENU_ID, { stock: 5 }, repository);
        expect(await customerMenu()).toMatchObject({ stock: 5, isSoldOut: false, isAvailable: true });
    });

    // F-26: 재고와 무관한 수동 품절 토글
    it("수동 품절을 켜면 재고가 남아도 품절, 끄면 바로 판매 가능", async () => {
        const { repository, menuRepository } = createFakeAdminMenuRepository([menu({ stock: 10 })]);
        const customerMenu = async () => (await getMenu("ko", { menuRepository, orderRepository: queue })).items[0];

        await updateAdminMenu(MENU_ID, { isSoldOutManual: true }, repository);
        expect(await customerMenu()).toMatchObject({ stock: 10, isSoldOut: true, isAvailable: false });

        await updateAdminMenu(MENU_ID, { isSoldOutManual: false }, repository);
        expect(await customerMenu()).toMatchObject({ isSoldOut: false, isAvailable: true });
    });

    it("가격을 바꾸면 고객 메뉴판 가격도 새 값(이후 주문은 새 가격으로 서버 계산 — F-27)", async () => {
        const { repository, menuRepository } = createFakeAdminMenuRepository([menu()]);

        await updateAdminMenu(MENU_ID, { basePrice: 3000 }, repository);

        const items = (await getMenu("ko", { menuRepository, orderRepository: queue })).items;
        expect(items[0].price).toBe(3000);
    });
});

describe("updateAdminOptionGroup — PATCH /api/admin/option-groups/{id}", () => {
    it("최소/최대·활성·이름을 바꾸고 그룹이 속한 메뉴 전체를 돌려준다", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);

        const updated = await updateAdminOptionGroup(GROUP_ID, { minSelect: 1, maxSelect: 1, translations: { ko: { name: "소스" } } }, repository);

        expect(updated.id).toBe(MENU_ID);
        expect(updated.optionGroups[0]).toMatchObject({ minSelect: 1, maxSelect: 1, translations: { ko: { name: "소스" }, en: { name: "Topping" } } });
    });

    it("한 쪽만 보내도 저장된 값과 비교해 최대 < 최소면 400 VALIDATION_ERROR, 저장하지 않는다", async () => {
        const { repository, calls } = createFakeAdminMenuRepository([menu({ optionGroups: [group({ minSelect: 0, maxSelect: 2 })] })]);

        const error = await updateAdminOptionGroup(GROUP_ID, { minSelect: 3 }, repository).catch((cause: unknown) => cause);

        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
        expect(calls).not.toContain("updateOptionGroup");
    });

    it("없는 그룹은 404 NOT_FOUND", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);
        await expect(updateAdminOptionGroup(MISSING_ID, { isActive: false }, repository)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });
});

describe("updateAdminOption — PATCH /api/admin/options/{id}", () => {
    it("추가 가격·판매 여부·이름을 바꾸고 옵션이 속한 메뉴 전체를 돌려준다", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);

        const updated = await updateAdminOption(OPTION_ID_2, { extraPrice: 800, isActive: true, translations: { en: { name: "Nuts" } } }, repository);

        expect(updated.id).toBe(MENU_ID);
        expect(updated.optionGroups[0].options[1]).toEqual({
            id: OPTION_ID_2,
            translations: { ko: { name: "견과" }, en: { name: "Nuts" } },
            extraPrice: 800,
            isActive: true,
        });
    });

    it("판매 중지한 옵션은 고객 메뉴의 옵션 목록에서 빠진다", async () => {
        const { repository, menuRepository } = createFakeAdminMenuRepository([menu()]);

        await updateAdminOption(OPTION_ID, { isActive: false }, repository);

        const items = (await getMenu("ko", { menuRepository, orderRepository: queue })).items;
        expect(items[0].optionGroups[0].options.map((option) => option.id)).toEqual([]);
    });

    it("없는 옵션은 404 NOT_FOUND", async () => {
        const { repository } = createFakeAdminMenuRepository([menu()]);
        await expect(updateAdminOption(MISSING_ID, { extraPrice: 100 }, repository)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });
});
