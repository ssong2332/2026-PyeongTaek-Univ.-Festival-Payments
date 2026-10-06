import { NextRequest, NextResponse } from "next/server";
import { FESTIVAL_DATES } from "@/domain/stats/csv";
import { createSupabaseReportRepository } from "@/infra/repositories/supabaseReportRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { getOperationsReport, resolveReportDates, type ReportDateRange } from "@/services/reportService";

export const dynamic = "force-dynamic";

// 기본은 축제 전체(CSV와 같은 FESTIVAL_DATES). from·to는 함께만 받는다.
function parseReportRange(request: NextRequest): ReportDateRange {
    const params = request.nextUrl.searchParams;
    const fromValues = params.getAll("from");
    const toValues = params.getAll("to");
    if (fromValues.length === 0 && toValues.length === 0) return FESTIVAL_DATES;
    if (fromValues.length !== 1 || toValues.length !== 1) throw new AppError("VALIDATION_ERROR", 400);
    return { from: fromValues[0], to: toValues[0] };
}

export const GET = withHandler(async (request: NextRequest) => {
    await requireAdmin();
    const range = parseReportRange(request);
    // DB 클라이언트를 만들기 전에 기간부터 검증한다(잘못된 기간은 400).
    resolveReportDates(range);
    const report = await getOperationsReport(range, createSupabaseReportRepository(createServiceClient()));
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
}, { route: "/api/admin/report" });
