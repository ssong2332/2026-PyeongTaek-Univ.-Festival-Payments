import { NextRequest, NextResponse } from "next/server";
import { kstDayUtcRange } from "@/domain/stats/aggregate";
import { loadStats } from "@/infra/repositories/statsRepository";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { StatsDtoSchema } from "@/lib/dto/stats";

export const dynamic = "force-dynamic";

function todayKst(): string {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const GET = withHandler(async (request: NextRequest) => {
    await requireAdmin();
    const dates = new URL(request.url).searchParams.getAll("date");
    if (dates.length > 1) throw new AppError("VALIDATION_ERROR", 400);
    const date = dates[0] ?? todayKst();
    if (date !== "all") {
        try { kstDayUtcRange(date); }
        catch { throw new AppError("VALIDATION_ERROR", 400); }
    }
    const summary = await loadStats(createServiceClient(), date);
    const parsed = StatsDtoSchema.safeParse(summary);
    if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
    return NextResponse.json(parsed.data, { headers: { "Cache-Control": "private, no-store" } });
}, { route: "/api/admin/stats" });
