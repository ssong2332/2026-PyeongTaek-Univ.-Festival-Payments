import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { acknowledgeAdminOrder } from "@/services/adminOrderService";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { AppError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

export const POST = withHandler(
    async (
        _request: NextRequest | undefined,
        context?: { params: Promise<{ id: string }> },
    ) => {
        const params = await context?.params;
        const id = params?.id;
        if (!id) {
            throw new AppError("NOT_FOUND", 404);
        }

        const repository = new SupabaseAdminOrderRepository();
        const updated = await acknowledgeAdminOrder(repository, id);
        return NextResponse.json(updated, { status: 200 });
    },
    { route: "/api/admin/orders/[id]/acknowledge" },
);
