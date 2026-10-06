import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { updateAdminOptionGroup } from "@/services/adminMenuService";
import { AdminOptionGroupPatchSchema } from "@/lib/dto/adminMenu";
import { parseJsonBody } from "@/lib/api/body";
import { withHandler } from "@/lib/api/handler";
import { parseUuidParam } from "@/lib/api/params";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Architecture 7절 PATCH /api/admin/option-groups/{id} (T-20): 그룹 이름·최소/최대 선택 수·활성.
// 최대 < 최소면 400, 없는 그룹은 404. 응답은 그룹이 속한 메뉴 전체(AdminMenuDto).
export const PATCH = withHandler(
    async (request?: NextRequest, context?: { params: Promise<{ id: string }> }) => {
        await requireAdmin();
        const params = await context?.params;
        const optionGroupId = parseUuidParam(params?.id);
        const patch = await parseJsonBody(request, AdminOptionGroupPatchSchema);
        const menu = await updateAdminOptionGroup(optionGroupId, patch, createSupabaseAdminMenuRepository(createServiceClient()));
        logger.info("menu.option_group.update", { route: "/api/admin/option-groups/[id]", message: Object.keys(patch).join(",") });
        return NextResponse.json(menu, { headers: { "Cache-Control": "private, no-store" } });
    },
    { route: "/api/admin/option-groups/[id]" },
);
