import { summarizeRatings } from "@/domain/review/summary";
import { kstDayUtcRange } from "@/domain/time/kst";
import { AppError } from "@/lib/api/errors";
import type { AdminReviewsResponse } from "@/lib/dto/review";
import type { AdminReviewRepository } from "@/services/reviewPorts";

// T-42: date는 통계 화면과 같은 값('YYYY-MM-DD' KST 하루 또는 'all'). 하루는 후기 작성 시각(reviews.created_at) 기준.
export async function listAdminReviews(
    date: string, repository: AdminReviewRepository,
): Promise<AdminReviewsResponse> {
    let range: { start: string; end: string } | null = null;
    if (date !== "all") {
        try { range = kstDayUtcRange(date); }
        catch { throw new AppError("VALIDATION_ERROR", 400); }
    }
    const reviews = await repository.listForAdmin(range);
    return { date, ...summarizeRatings(reviews.map(review => review.rating)), reviews };
}
