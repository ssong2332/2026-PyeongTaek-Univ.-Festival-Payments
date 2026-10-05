import { NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminMenuRepository } from "@/infra/repositories/adminMenuRepository";
import { listAdminMenus } from "@/services/adminMenuService";
import { withHandler } from "@/lib/api/handler";

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
