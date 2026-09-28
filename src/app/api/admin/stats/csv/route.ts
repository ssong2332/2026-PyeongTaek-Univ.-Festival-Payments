import { NextRequest } from "next/server";
import { buildOrdersCsv, FESTIVAL_DATES, type CsvDateRange } from "@/domain/stats/csv";
import { kstDayUtcRange } from "@/domain/stats/aggregate";
import { loadCsvOrders } from "@/infra/repositories/csvOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";

export const dynamic = "force-dynamic";

function parseDateRange(request: NextRequest): CsvDateRange {
    const params = request.nextUrl.searchParams;
    const fromValues = params.getAll("from");
    const toValues = params.getAll("to");
    if (fromValues.length === 0 && toValues.length === 0) return FESTIVAL_DATES;
    if (fromValues.length !== 1 || toValues.length !== 1) {
        throw new AppError("VALIDATION_ERROR", 400);
    }

    const range = { from: fromValues[0], to: toValues[0] };
    try {
        if (kstDayUtcRange(range.from).start >= kstDayUtcRange(range.to).end) {
            throw new RangeError("from must not be after to");
        }
    } catch {
        throw new AppError("VALIDATION_ERROR", 400);
    }
    return range;
}

export const GET = withHandler(async (request: NextRequest) => {
    await requireAdmin();
    const range = parseDateRange(request);
    const orders = await loadCsvOrders(createServiceClient(), range);
    const csv = buildOrdersCsv(orders, range);

    return new Response(csv.content, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="orders_${range.from}_${range.to}.csv"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}, { route: "/api/admin/stats/csv" });
