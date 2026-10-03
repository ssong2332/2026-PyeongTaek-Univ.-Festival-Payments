import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { resolveCancelRequest } from "@/services/adminOrderService";
import { AdminCancelRequestDecisionSchema } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";
import { parseUuidParam } from "@/lib/api/params";

export const dynamic = "force-dynamic";

// Architecture "POST /api/admin/orders/{id}/cancel-request" (T-35, F-18). 고객 취소 요청의 승인·거절.
export const POST = withHandler(
    async (
        request?: NextRequest,
        context?: { params: Promise<{ id: string }> },
    ) => {
        const adminUser = await requireAdmin();

        const params = await context?.params;
        // requireAdmin() 이후에 검증해 미인증 요청은 id 형식과 무관하게 401을 먼저 받는다.
        const orderId = parseUuidParam(params?.id);

        if (!request) {
            throw new AppError("VALIDATION_ERROR", 400);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            throw new AppError("VALIDATION_ERROR", 400);
        }

        const parsed = AdminCancelRequestDecisionSchema.safeParse(body);
        if (!parsed.success) {
            throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
        }

        const serviceClient = createServiceClient();
        const order = await resolveCancelRequest(
            {
                orderId,
                decision: parsed.data.decision,
                reason: parsed.data.reason,
                adminId: adminUser.id,
            },
            {
                orderRepository: createSupabaseOrderRepository(serviceClient),
                adminOrderRepository: new SupabaseAdminOrderRepository(serviceClient),
            },
        );

        return NextResponse.json(order, { status: 200 });
    },
    { route: "/api/admin/orders/[id]/cancel-request" },
);
