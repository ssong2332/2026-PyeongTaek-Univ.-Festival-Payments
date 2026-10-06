import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { updateAdminMenu } from "@/services/adminMenuService";
import { AdminMenuPatchSchema } from "@/lib/dto/adminMenu";
import { parseJsonBody } from "@/lib/api/body";
import { withHandler } from "@/lib/api/handler";
import { parseUuidParam } from "@/lib/api/params";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Architecture 7절 PATCH /api/admin/menus/{id} (T-20, F-25·F-26·F-27): 가격·재고·수동 품절·이름/설명(ko·en).
// ko 이름 빈값·음수 가격/재고·모르는 필드는 400 VALIDATION_ERROR, 없는 메뉴는 404.
export const PATCH = withHandler(
    async (request?: NextRequest, context?: { params: Promise<{ id: string }> }) => {
        await requireAdmin();
        const params = await context?.params;
        // requireAdmin() 이후에 검증해 미인증 요청은 id 형식과 무관하게 401을 먼저 받는다.
        const menuItemId = parseUuidParam(params?.id);
        const patch = await parseJsonBody(request, AdminMenuPatchSchema);
        const menu = await updateAdminMenu(menuItemId, patch, createSupabaseAdminMenuRepository(createServiceClient()));
        // 운영 중 변경 추적용으로 바뀐 칸 이름만 남긴다(값은 남기지 않음).
        logger.info("menu.update", { route: "/api/admin/menus/[id]", message: Object.keys(patch).join(",") });
        return NextResponse.json(menu, { headers: { "Cache-Control": "private, no-store" } });
    },
    { route: "/api/admin/menus/[id]" },
);
