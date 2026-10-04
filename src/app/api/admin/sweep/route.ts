import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { requireAdmin } from "@/infra/supabase/session";
import { SupabaseSweepRepository } from "@/infra/repositories/supabaseSweepRepository";
import { sweepOrders } from "@/services/sweepService";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withHandler(
    async () => {
        await requireAdmin();
        const result = await sweepOrders(new SupabaseSweepRepository());
        logger.info("order.sweep", { route: "/api/admin/sweep" });
        return NextResponse.json(result);
    },
    { route: "/api/admin/sweep" },
);
