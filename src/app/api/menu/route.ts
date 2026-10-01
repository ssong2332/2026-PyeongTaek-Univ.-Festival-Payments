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
        // lang만 읽는다(여러 번 오면 첫 값). /api/admin/orders와 같은 방식.
        const searchParams = request ? new URL(request.url).searchParams : undefined;
        const parsed = MenuQuerySchema.safeParse({ lang: searchParams?.get("lang") ?? undefined });
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);

        // anon은 메뉴 테이블을 읽을 수 없다(RLS, Architecture 3절) — 서버의 service_role 클라이언트로 읽는다.
        const client = createServiceClient();
        const menu = await getMenu(parsed.data.lang, {
            menuRepository: createSupabaseMenuRepository(client),
            orderRepository: createSupabaseOrderRepository(client),
        });

        // 재고·품절·대기 수는 요청마다 달라진다 — 브라우저·중간 캐시가 저장하지 않게 한다.
        return NextResponse.json(menu, { status: 200, headers: { "Cache-Control": "no-store" } });
    },
    { route: "/api/menu" },
);
