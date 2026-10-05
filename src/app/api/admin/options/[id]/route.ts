import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { updateAdminOption } from "@/services/adminMenuService";
import { AdminOptionPatchSchema } from "@/lib/dto/adminMenu";
import { parseJsonBody } from "@/lib/api/body";
import { withHandler } from "@/lib/api/handler";
import { parseUuidParam } from "@/lib/api/params";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Architecture 7절 PATCH /api/admin/options/{id} (T-20): 옵션 이름·추가 가격·판매 여부.
// 없는 옵션은 404. 응답은 옵션이 속한 메뉴 전체(AdminMenuDto).
export const PATCH = withHandler(
    async (request?: NextRequest, context?: { params: Promise<{ id: string }> }) => {
        await requireAdmin();
        const params = await context?.params;
        const optionId = parseUuidParam(params?.id);
        const patch = await parseJsonBody(request, AdminOptionPatchSchema);
        const menu = await updateAdminOption(optionId, patch, createSupabaseAdminMenuRepository(createServiceClient()));
        logger.info("menu.option.update", { route: "/api/admin/options/[id]", message: Object.keys(patch).join(",") });
        return NextResponse.json(menu, { headers: { "Cache-Control": "private, no-store" } });
    },
    { route: "/api/admin/options/[id]" },
);
