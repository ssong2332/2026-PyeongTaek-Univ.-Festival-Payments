import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { transition, getAdminOrderById } from "@/services/adminOrderService";
import { AdminTransitionRequestSchema } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const POST = withHandler(
    async (
        request?: NextRequest,
        context?: { params: Promise<{ id: string }> },
    ) => {
        const adminUser = await requireAdmin();

        const params = await context?.params;
        const orderId = params?.id;
        if (!orderId) {
            throw new AppError("NOT_FOUND", 404);
        }

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
            throw new AppError("VALIDATION_ERROR", 400, parsed.error.format());
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
