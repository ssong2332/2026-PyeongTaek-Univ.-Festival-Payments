import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuRepository } from "@/services/ports";
import { toMenuItemRecord } from "./mappers";

// 메뉴 → 번역·옵션 그룹(→ 번역·옵션(→ 번역))을 한 번에 가져온다(PostgREST 임베드). 거르기·정렬은 menuService가 한다.
const MENU_SELECT = `
  id, base_price, stock, is_sold_out_manual, is_active, sort_order, image_url,
  menu_item_translations ( locale, name, description ),
  option_groups (
    id, min_select, max_select, sort_order, is_active,
    option_group_translations ( locale, name ),
    options (
      id, extra_price, sort_order, is_active,
      option_translations ( locale, name )
    )
  )
`;

export function createSupabaseMenuRepository(client: SupabaseClient): MenuRepository {
    return {
        async listMenuItems() {
            const { data, error } = await client.from("menu_items").select(MENU_SELECT);
            // AppError로 바꾸지 않는다 — withHandler가 기록하고 500 INTERNAL_ERROR로 숨긴다(DB 메시지 비노출).
            if (error) throw new Error(`menu_items.list failed: ${error.code ?? "unknown"} ${error.message}`);
            return (data ?? []).map((row: unknown) => toMenuItemRecord(row));
        },
    };
}
