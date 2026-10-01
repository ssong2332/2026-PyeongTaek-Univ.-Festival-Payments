import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { getAdminOrderById } from "@/services/adminOrderService";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { requireAdmin } from "@/infra/supabase/session";
import { parseUuidParam } from "@/lib/api/params";

export const dynamic = "force-dynamic";

export const GET = withHandler(
    async (
        _request: NextRequest | undefined,
        context?: { params: Promise<{ id: string }> },
    ) => {
        await requireAdmin();
        const params = await context?.params;
        const id = parseUuidParam(params?.id);

        const repository = new SupabaseAdminOrderRepository();
        const order = await getAdminOrderById(repository, id);
        return NextResponse.json(order, { status: 200 });
    },
    { route: "/api/admin/orders/[id]" },
);
