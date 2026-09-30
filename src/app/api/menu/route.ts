import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { MenuQuerySchema } from "@/lib/dto/menu";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseMenuRepository } from "@/infra/repositories/supabaseMenuRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { getMenu } from "@/services/menuService";

export const dynamic = "force-dynamic";

export const GET = withHandler(
    async (request?: NextRequest) => {
        // lang 외 쿼리는 보지 않는다(/api/admin/orders와 같은 방식).
        const lang = request?.nextUrl.searchParams.get("lang") ?? undefined;
        const parsed = MenuQuerySchema.safeParse({ lang });
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);

        // anon은 메뉴 테이블을 읽을 수 없다(RLS, Architecture 3절) — 서버의 service_role 클라이언트로 읽는다.
        const client = createServiceClient();
        const menu = await getMenu(parsed.data.lang, {
            menuRepository: createSupabaseMenuRepository(client),
            orderRepository: createSupabaseOrderRepository(client),
        });

        return NextResponse.json(menu, { status: 200 });
    },
    { route: "/api/menu" },
);
