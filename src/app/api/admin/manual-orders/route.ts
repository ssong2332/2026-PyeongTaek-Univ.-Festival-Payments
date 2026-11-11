import { NextRequest, NextResponse } from "next/server";
import { createSupabaseManualOrderRepository } from "@/infra/repositories/supabaseManualOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { ManualOrderRequestSchema } from "@/lib/dto/manualOrder";
import { createManualOrder } from "@/services/manualOrderService";

export const dynamic = "force-dynamic";

// Architecture "POST /api/admin/manual-orders" (T-28, F-34, DECISIONS #62). 수기 주문 사후 입력.
// 201 신규 / 200 같은 멱등키 재요청(같은 주문, 재고·매출 중복 없음).
export const POST = withHandler(
    async (request?: NextRequest) => {
        // 인증을 먼저 본다 — 미인증 요청은 본문과 무관하게 401.
        const adminUser = await requireAdmin();

        const body: unknown = await request?.json().catch(() => undefined);
        const parsed = ManualOrderRequestSchema.safeParse(body);
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);

        const result = await createManualOrder(parsed.data, {
            manualOrderRepository: createSupabaseManualOrderRepository(createServiceClient()),
            adminId: adminUser.id,
        });
        return NextResponse.json(result, {
            status: result.created ? 201 : 200,
            headers: { "Cache-Control": "private, no-store" },
        });
    },
    { route: "/api/admin/manual-orders" },
);
