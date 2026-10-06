import { NextResponse } from "next/server";
import { createSupabaseReviewRepository } from "@/infra/repositories/supabaseReviewRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { SubmitReviewRequestSchema } from "@/lib/dto/review";
import { submitReview, validateReviewToken } from "@/services/reviewService";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
    const response = await withHandler(async () => {
        const { token } = await params;
        validateReviewToken(token);
        const body: unknown = await request.json().catch(() => undefined);
        const parsed = SubmitReviewRequestSchema.safeParse(body);
        // 자유 입력 텍스트·추가 필드의 실제 값은 응답이나 로그에 넣지 않는다.
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", 400);
        const result = await submitReview(token, parsed.data,
            createSupabaseReviewRepository(createServiceClient()));
        return NextResponse.json(result, { status: 201 });
    }, { route: "/api/orders/[token]/reviews" })();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
