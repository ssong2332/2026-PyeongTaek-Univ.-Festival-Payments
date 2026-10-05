import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import type { AdminMenuRepository } from "@/services/ports";
import { toMenuItemRecord } from "./mappers";
import { MENU_SELECT } from "./supabaseMenuRepository";

// 관리자 메뉴·재고 관리(T-20). service_role 클라이언트로만 만든다(라우트가 requireAdmin 뒤에 넘긴다).
// DB 에러 원문은 응답에 담지 않는다(Architecture 5절 — 500은 상세 비노출).
// supabase-js에는 트랜잭션이 없어 메뉴 칸·번역을 차례로 쓴다. 요청 값이 모두 "최종 값"이라 중간에 실패해도
// 같은 요청을 다시 보내면 같은 결과가 된다(화면은 실패 시 다시 저장하게 안내한다).
const internal = () => new AppError("INTERNAL_ERROR", 500);

type OptionGroupRow = { menu_item_id: string; min_select: number; max_select: number };
type OptionRow = { option_groups: { menu_item_id: string } | { menu_item_id: string }[] | null };

export function createSupabaseAdminMenuRepository(client: SupabaseClient): AdminMenuRepository {
    return {
        async listMenuItems() {
            const { data, error } = await client.from("menu_items").select(MENU_SELECT);
            if (error) throw internal();
            return (data ?? []).map((row: unknown) => toMenuItemRecord(row));
        },

        async getMenuItem(id) {
            const { data, error } = await client.from("menu_items").select(MENU_SELECT).eq("id", id).maybeSingle();
            if (error) throw internal();
            return data ? toMenuItemRecord(data) : null;
        },

        async updateMenuItem(id, patch) {
            const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (patch.basePrice !== undefined) row.base_price = patch.basePrice;
            if (patch.stock !== undefined) row.stock = patch.stock;
            if (patch.isSoldOutManual !== undefined) row.is_sold_out_manual = patch.isSoldOutManual;
            const { data, error } = await client.from("menu_items").update(row).eq("id", id).select("id");
            if (error) throw internal();
            return (data ?? []).length > 0;
        },

        async upsertMenuTranslation(menuItemId, translation) {
            const row: Record<string, unknown> = { menu_item_id: menuItemId, locale: translation.locale, name: translation.name };
            // 설명을 보내지 않으면 칸을 빼서 기존 설명을 지키고, null이면 지운다.
            if (translation.description !== undefined) row.description = translation.description;
            const { error } = await client.from("menu_item_translations").upsert(row, { onConflict: "menu_item_id,locale" });
            if (error) throw internal();
        },

        async findOptionGroup(id) {
            const { data, error } = await client
                .from("option_groups")
                .select("menu_item_id, min_select, max_select")
                .eq("id", id)
                .maybeSingle();
            if (error) throw internal();
            if (!data) return null;
            const row = data as OptionGroupRow;
            return { menuItemId: row.menu_item_id, minSelect: row.min_select, maxSelect: row.max_select };
        },

        async updateOptionGroup(id, patch) {
            const row: Record<string, unknown> = {};
            if (patch.minSelect !== undefined) row.min_select = patch.minSelect;
            if (patch.maxSelect !== undefined) row.max_select = patch.maxSelect;
            if (patch.isActive !== undefined) row.is_active = patch.isActive;
            if (Object.keys(row).length === 0) return;
            const { error } = await client.from("option_groups").update(row).eq("id", id);
            if (error) throw internal();
        },

        async upsertOptionGroupTranslation(optionGroupId, translation) {
            const { error } = await client
                .from("option_group_translations")
                .upsert({ option_group_id: optionGroupId, locale: translation.locale, name: translation.name }, { onConflict: "option_group_id,locale" });
            if (error) throw internal();
        },

        async findOptionMenuItemId(id) {
            const { data, error } = await client.from("options").select("option_groups ( menu_item_id )").eq("id", id).maybeSingle();
            if (error) throw internal();
            if (!data) return null;
            // 다대일 임베드는 객체로 오지만, 타입 생성 없이 쓰므로 배열 모양도 받아 둔다.
            const group = (data as OptionRow).option_groups;
            const owner = Array.isArray(group) ? group[0] : group;
            return owner?.menu_item_id ?? null;
        },

        async updateOption(id, patch) {
            const row: Record<string, unknown> = {};
            if (patch.extraPrice !== undefined) row.extra_price = patch.extraPrice;
            if (patch.isActive !== undefined) row.is_active = patch.isActive;
            if (Object.keys(row).length === 0) return;
            const { error } = await client.from("options").update(row).eq("id", id);
            if (error) throw internal();
        },

        async upsertOptionTranslation(optionId, translation) {
            const { error } = await client
                .from("option_translations")
                .upsert({ option_id: optionId, locale: translation.locale, name: translation.name }, { onConflict: "option_id,locale" });
            if (error) throw internal();
        },
    };
}
