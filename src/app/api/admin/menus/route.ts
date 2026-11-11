import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { createAdminMenu, listAdminMenus } from "@/services/adminMenuService";
import { withHandler } from "@/lib/api/handler";
import { parseJsonBody } from "@/lib/api/body";
import { AdminMenuCreateSchema } from "@/lib/dto/adminMenu";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Architecture 7절 GET /api/admin/menus (T-20): 비활성 포함 전체 메뉴 — 관리 화면(1차는 수정만)이 쓴다.
export const GET = withHandler(
    async () => {
        await requireAdmin();
        const result = await listAdminMenus(createSupabaseAdminMenuRepository(createServiceClient()));
        return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
    },
    { route: "/api/admin/menus" },
);


export const POST = withHandler(
    async (request?: NextRequest) => {
        await requireAdmin();
        const input = await parseJsonBody(request, AdminMenuCreateSchema);
        const menu = await createAdminMenu(input, createSupabaseAdminMenuRepository(createServiceClient()));
        logger.info("menu.create", { route: "/api/admin/menus", message: menu.id });
        return NextResponse.json(menu, {
            status: 201,
            headers: { "Cache-Control": "private, no-store" },
        });
    },
    { route: "/api/admin/menus" },
);
