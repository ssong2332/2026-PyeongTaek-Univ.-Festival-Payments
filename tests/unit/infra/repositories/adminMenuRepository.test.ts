import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";

const MENU_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "12121212-1212-1212-1212-121212121212";
const OPTION_ID = "13131313-1313-1313-1313-131313131313";

type Response = { data: unknown; error: { message: string; code?: string } | null };
type Call = { table: string; method: string; args: unknown[] };

// supabase-js 쿼리 빌더 흉내: from(table) 뒤의 select·update·upsert·eq·maybeSingle 호출을 기록하고,
// 마지막에 await하면 테이블별로 정한 응답을 돌려준다.
function fakeClient(responses: Record<string, Response>) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const response = responses[table] ?? { data: null, error: null };
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "update", "upsert", "eq", "maybeSingle"]) {
            builder[method] = (...args: unknown[]) => {
                calls.push({ table, method, args });
                return builder;
            };
        }
        builder.then = (resolve: (value: Response) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(response).then(resolve, reject);
        return builder;
    };
    return { client: { from } as unknown as SupabaseClient, calls };
}

const call = (calls: Call[], table: string, method: string) => calls.find((entry) => entry.table === table && entry.method === method);

describe("adminMenuRepository", () => {
    it("관리자 조회는 추천 컬럼을 포함한다", async () => {
        const { client, calls } = fakeClient({ menu_items: { data: [], error: null } });
        await createSupabaseAdminMenuRepository(client).listMenuItems();
        expect(String(call(calls, "menu_items", "select")!.args[0])).toContain("is_recommended");
    });

    it("updateMenuItem: 보낸 칸만 DB 칸 이름으로 옮기고 updated_at을 갱신, 행이 없으면 false", async () => {
        const { client, calls } = fakeClient({ menu_items: { data: [{ id: MENU_ID }], error: null } });
        const repository = createSupabaseAdminMenuRepository(client);

        await expect(repository.updateMenuItem(MENU_ID, { stock: 0, isSoldOutManual: true, isRecommended: true })).resolves.toBe(true);

        const row = call(calls, "menu_items", "update")!.args[0] as Record<string, unknown>;
        expect(Object.keys(row).sort()).toEqual(["is_recommended", "is_sold_out_manual", "stock", "updated_at"]);
        expect(row).toMatchObject({ stock: 0, is_sold_out_manual: true, is_recommended: true });
        expect(call(calls, "menu_items", "eq")!.args).toEqual(["id", MENU_ID]);

        const missing = fakeClient({ menu_items: { data: [], error: null } });
        await expect(createSupabaseAdminMenuRepository(missing.client).updateMenuItem(MENU_ID, { basePrice: 1 })).resolves.toBe(false);
    });

    it("upsertMenuTranslation: 언어별 한 행 upsert — 설명을 보내지 않으면 칸을 빼서 기존 설명을 지킨다", async () => {
        const { client, calls } = fakeClient({});
        const repository = createSupabaseAdminMenuRepository(client);

        await repository.upsertMenuTranslation(MENU_ID, { locale: "en", name: "Honey Hotteok" });
        await repository.upsertMenuTranslation(MENU_ID, { locale: "ko", name: "꿀 호떡", description: null });

        const upserts = calls.filter((entry) => entry.method === "upsert");
        expect(upserts.map((entry) => entry.table)).toEqual(["menu_item_translations", "menu_item_translations"]);
        expect(upserts[0].args).toEqual([{ menu_item_id: MENU_ID, locale: "en", name: "Honey Hotteok" }, { onConflict: "menu_item_id,locale" }]);
        expect(upserts[1].args[0]).toEqual({ menu_item_id: MENU_ID, locale: "ko", name: "꿀 호떡", description: null });
    });

    it("findOptionGroup / findOptionMenuItemId: 소속 메뉴를 찾고, 없으면 null", async () => {
        const found = fakeClient({
            option_groups: { data: { menu_item_id: MENU_ID, min_select: 1, max_select: 2 }, error: null },
            options: { data: { option_groups: { menu_item_id: MENU_ID } }, error: null },
        });
        const repository = createSupabaseAdminMenuRepository(found.client);
        await expect(repository.findOptionGroup(GROUP_ID)).resolves.toEqual({ menuItemId: MENU_ID, minSelect: 1, maxSelect: 2 });
        await expect(repository.findOptionMenuItemId(OPTION_ID)).resolves.toBe(MENU_ID);

        const none = createSupabaseAdminMenuRepository(fakeClient({}).client);
        await expect(none.findOptionGroup(GROUP_ID)).resolves.toBeNull();
        await expect(none.findOptionMenuItemId(OPTION_ID)).resolves.toBeNull();
    });

    it("updateOption / updateOptionGroup: 보낸 칸만 옮기고, 바꿀 칸이 없으면 쿼리하지 않는다", async () => {
        const { client, calls } = fakeClient({});
        const repository = createSupabaseAdminMenuRepository(client);

        await repository.updateOption(OPTION_ID, { extraPrice: 700, isActive: false });
        await repository.updateOptionGroup(GROUP_ID, { maxSelect: 3 });
        await repository.updateOptionGroup(GROUP_ID, {});

        expect(call(calls, "options", "update")!.args[0]).toEqual({ extra_price: 700, is_active: false });
        expect(calls.filter((entry) => entry.table === "option_groups" && entry.method === "update").map((entry) => entry.args[0])).toEqual([{ max_select: 3 }]);
    });

    it("DB 에러는 원문 없이 500 INTERNAL_ERROR", async () => {
        const failing = createSupabaseAdminMenuRepository(
            fakeClient({
                menu_items: { data: null, error: { message: "permission denied for table menu_items", code: "42501" } },
                options: { data: null, error: { message: "boom" } },
            }).client,
        );

        const error = await failing.listMenuItems().catch((cause: unknown) => cause);
        expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
        expect(JSON.stringify(error)).not.toContain("permission denied");
        await expect(failing.updateMenuItem(MENU_ID, { stock: 1 })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
        await expect(failing.updateOption(OPTION_ID, { extraPrice: 1 })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    });
});
