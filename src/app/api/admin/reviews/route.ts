import { NextRequest, NextResponse } from "next/server";
import { kstDayUtcRange } from "@/domain/time/kst";
import { createSupabaseAdminReviewRepository } from "@/infra/repositories/supabaseReviewRepository";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { AdminReviewsResponseSchema } from "@/lib/dto/review";
import { listAdminReviews } from "@/services/adminReviewService";

export const dynamic = "force-dynamic";

function todayKst(): string {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const handle = withHandler(async (request: NextRequest) => {
    await requireAdmin();
    const dates = new URL(request.url).searchParams.getAll("date");
    if (dates.length > 1) throw new AppError("VALIDATION_ERROR", 400);
    const date = dates[0] ?? todayKst();
    if (date !== "all") {
        try { kstDayUtcRange(date); }
        catch { throw new AppError("VALIDATION_ERROR", 400); }
    }
    const result = await listAdminReviews(date, createSupabaseAdminReviewRepository(createServiceClient()));
    // 실패 내용(zod issues)에는 후기 텍스트가 들어갈 수 있어 응답·로그로 넘기지 않는다.
    const parsed = AdminReviewsResponseSchema.safeParse(result);
    if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
    return NextResponse.json(parsed.data);
}, { route: "/api/admin/reviews" });

export async function GET(request: NextRequest) {
    const response = await handle(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
