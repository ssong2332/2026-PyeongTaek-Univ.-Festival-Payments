import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { transition, getAdminOrderById } from "@/services/adminOrderService";
import { AdminTransitionRequestSchema } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";
import { parseUuidParam } from "@/lib/api/params";

export const dynamic = "force-dynamic";

export const POST = withHandler(
    async (
        request?: NextRequest,
        context?: { params: Promise<{ id: string }> },
    ) => {
        const adminUser = await requireAdmin();

        const params = await context?.params;
        // requireAdmin() 이후에 검증해 미인증 요청은 id 형식과 무관하게 401을 먼저 받는다.
        // 형식이 틀린 id가 DB까지 가면 22P02 → 500이 되므로 여기서 400으로 거른다.
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

        const parsed = AdminTransitionRequestSchema.safeParse(body);
        if (!parsed.success) {
            // POST /api/orders·parseUuidParam과 같은 details 형식(zod issues 배열)으로 맞춘다.
            throw new AppError("VALIDATION_ERROR", 400, parsed.error.issues);
        }

        const serviceClient = createServiceClient();
        const orderRepository = createSupabaseOrderRepository(serviceClient);

        await transition(
            {
                orderId,
                action: parsed.data.action,
                adminId: adminUser.id,
                reason: parsed.data.reason,
                refundChannel: parsed.data.refundChannel,
            },
            { orderRepository },
        );

        const adminOrderRepository = new SupabaseAdminOrderRepository(serviceClient);
        const updatedOrder = await getAdminOrderById(adminOrderRepository, orderId);

        return NextResponse.json(updatedOrder, { status: 200 });
    },
    { route: "/api/admin/orders/[id]/transition" },
);
