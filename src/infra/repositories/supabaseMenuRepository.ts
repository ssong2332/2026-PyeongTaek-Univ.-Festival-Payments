import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import type { MenuRepository } from "@/services/ports";
import { toMenuItemRecord } from "./mappers";

// 메뉴 → 번역·옵션 그룹(→ 번역·옵션(→ 번역))을 한 번에 가져온다(PostgREST 임베드). 거르기·정렬은 menuService가 한다.
// 관리자 메뉴 저장소(adminMenuRepository)도 같은 모양으로 읽는다.
export const MENU_SELECT = `
  id, base_price, stock, is_recommended, is_sold_out_manual, is_active, sort_order, image_url,
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

// 고객·관리자 메뉴 조회가 같은 추천 플래그를 사용한다. 운영 DB 0101 적용 전에는 배포하지 않는다.
export const ADMIN_MENU_SELECT = MENU_SELECT;

export function createSupabaseMenuRepository(client: SupabaseClient): MenuRepository {
    return {
        async listMenuItems() {
            const { data, error } = await client.from("menu_items").select(MENU_SELECT);
            // DB 에러 원문은 담지 않는다(Architecture 5절 — 500은 상세 비노출).
            if (error) throw new AppError("INTERNAL_ERROR", 500);
            return (data ?? []).map((row: unknown) => toMenuItemRecord(row));
        },
    };
}
