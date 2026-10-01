import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { AppError } from "@/lib/api/errors";

const MENU_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "12121212-1212-1212-1212-121212121212";
const OPTION_ID = "13131313-1313-1313-1313-131313131313";

type DbError = { message: string; code?: string };

// supabase-js의 from().select()만 흉내 낸다.
function fakeClient(response: { data: unknown; error: DbError | null }) {
    const select = vi.fn().mockResolvedValue(response);
    const from = vi.fn(() => ({ select }));
    return { client: { from } as unknown as SupabaseClient, from, select };
}

function listWith(data: unknown) {
    const { client } = fakeClient({ data, error: null });
    return createSupabaseMenuRepository(client).listMenuItems();
}

describe("supabaseMenuRepository.listMenuItems", () => {
    it("menu_items를 한 번 조회한다", async () => {
        const { client, from, select } = fakeClient({ data: [], error: null });

        await createSupabaseMenuRepository(client).listMenuItems();

        expect(from).toHaveBeenCalledTimes(1);
        expect(from).toHaveBeenCalledWith("menu_items");
        expect(select).toHaveBeenCalledTimes(1);
    });

    it("임베드된 번역·옵션 그룹·옵션을 필드 단위로 옮기고, 모르는 컬럼은 버린다", async () => {
        const records = await listWith([{
            id: MENU_ID,
            base_price: 2500,
            stock: 4,
            is_sold_out_manual: true,
            is_active: false,
            sort_order: 3,
            image_url: "https://example.com/a.png",
            created_at: "2026-10-01T00:00:00+00:00",
            menu_item_translations: [
                { menu_item_id: MENU_ID, locale: "ko", name: "뿌링클 호떡", description: "뿌링클" },
                { menu_item_id: MENU_ID, locale: "en", name: "Bburinkle Hotteok", description: null },
            ],
            option_groups: [{
                id: GROUP_ID,
                menu_item_id: MENU_ID,
                min_select: 1,
                max_select: 2,
                sort_order: 0,
                is_active: true,
                option_group_translations: [{ option_group_id: GROUP_ID, locale: "ko", name: "소스" }],
                options: [{
                    id: OPTION_ID,
                    option_group_id: GROUP_ID,
                    extra_price: 0,
                    sort_order: 7,
                    is_active: false,
                    option_translations: [
                        { option_id: OPTION_ID, locale: "ko", name: "꿀" },
                        { option_id: OPTION_ID, locale: "en", name: "Honey" },
                    ],
                }],
            }],
        }]);

        expect(records).toEqual([{
            id: MENU_ID,
            basePrice: 2500,
            stock: 4,
            isSoldOutManual: true,
            isActive: false,
            sortOrder: 3,
            imageUrl: "https://example.com/a.png",
            translations: [
                { locale: "ko", name: "뿌링클 호떡", description: "뿌링클" },
                { locale: "en", name: "Bburinkle Hotteok", description: null },
            ],
            optionGroups: [{
                id: GROUP_ID,
                minSelect: 1,
                maxSelect: 2,
                sortOrder: 0,
                isActive: true,
                translations: [{ locale: "ko", name: "소스" }],
                options: [{
                    id: OPTION_ID,
                    extraPrice: 0,
                    sortOrder: 7,
                    isActive: false,
                    translations: [
                        { locale: "ko", name: "꿀" },
                        { locale: "en", name: "Honey" },
                    ],
                }],
            }],
        }]);
    });

    it("임베드 배열이 없거나 null이면 빈 배열, image_url·description이 없으면 null", async () => {
        const records = await listWith([{
            id: MENU_ID,
            base_price: 2000,
            stock: 0,
            is_sold_out_manual: false,
            is_active: true,
            sort_order: 0,
            menu_item_translations: [{ locale: "ko", name: "기본호떡" }],
            option_groups: [{
                id: GROUP_ID,
                min_select: 0,
                max_select: 1,
                sort_order: 0,
                is_active: true,
                option_group_translations: null,
                options: null,
            }],
        }]);

        expect(records[0].imageUrl).toBeNull();
        expect(records[0].translations).toEqual([{ locale: "ko", name: "기본호떡", description: null }]);
        expect(records[0].optionGroups[0].translations).toEqual([]);
        expect(records[0].optionGroups[0].options).toEqual([]);
    });

    it("메뉴 행에 번역·옵션 그룹 키가 없으면 둘 다 빈 배열", async () => {
        const records = await listWith([{
            id: MENU_ID,
            base_price: 2000,
            stock: 1,
            is_sold_out_manual: false,
            is_active: true,
            sort_order: 0,
            image_url: null,
        }]);

        expect(records[0].translations).toEqual([]);
        expect(records[0].optionGroups).toEqual([]);
    });

    it("data가 null이면 빈 목록", async () => {
        expect(await listWith(null)).toEqual([]);
    });

    it("DB 에러는 AppError(INTERNAL_ERROR, 500)로 던지고 DB 메시지·details를 담지 않는다", async () => {
        const { client } = fakeClient({ data: null, error: { message: "connection refused", code: "08006" } });

        const error = await createSupabaseMenuRepository(client).listMenuItems().catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500, details: undefined });
        expect((error as Error).message).not.toContain("connection refused");
        expect((error as Error).message).not.toContain("08006");
    });
});
