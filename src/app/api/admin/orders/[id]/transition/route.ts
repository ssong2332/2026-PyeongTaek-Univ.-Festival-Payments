import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { getAdminOrderById, transition } from "@/services/adminOrderService";

export const dynamic = "force-dynamic";

const T16TransitionSchema = z.strictObject({
    action: z.enum(["confirm_payment", "confirm_cash", "start_cooking", "complete"]),
});

export const POST = withHandler(
    async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
        const admin = await requireAdmin();
        const { id } = await context.params;
        if (!z.uuid().safeParse(id).success) throw new AppError("VALIDATION_ERROR", 400);

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            throw new AppError("VALIDATION_ERROR", 400);
        }
        const input = T16TransitionSchema.safeParse(body);
        if (!input.success) throw new AppError("VALIDATION_ERROR", 400);

        const client = createServiceClient();
        await transition({ orderId: id, action: input.data.action, adminId: admin.id }, {
            orderRepository: createSupabaseOrderRepository(client),
        });
        const updated = await getAdminOrderById(new SupabaseAdminOrderRepository(client), id);
        logger.info("order.transition", { route: "/api/admin/orders/[id]/transition", orderId: id });
        return NextResponse.json(updated);
    },
    { route: "/api/admin/orders/[id]/transition" },
);
