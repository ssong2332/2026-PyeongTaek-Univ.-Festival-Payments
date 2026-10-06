import { describe, expect, it, vi } from "vitest";
import type { AdminReviewDto } from "@/lib/dto/review";
import { listAdminReviews } from "@/services/adminReviewService";
import type { AdminReviewRepository } from "@/services/reviewPorts";

const review = (rating: number, index: number): AdminReviewDto => ({
    orderId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, pickupNumber: index,
    manualNumber: null, rating, text: null, createdAt: "2026-10-07T03:12:00.000Z",
});
function repository(reviews: AdminReviewDto[]): AdminReviewRepository {
    return { listForAdmin: vi.fn().mockResolvedValue(reviews) };
}

describe("T-42 listAdminReviews", () => {
    it("KST 하루 범위로 읽고 목록과 별점 평균·건수를 함께 돌려준다", async () => {
        const reviews = [review(5, 1), review(4, 2), review(4, 3)];
        const repo = repository(reviews);
        expect(await listAdminReviews("2026-10-07", repo)).toEqual({
            date: "2026-10-07", count: 3, averageRating: 4.3, reviews,
        });
        expect(repo.listForAdmin).toHaveBeenCalledWith({
            start: "2026-10-06T15:00:00.000Z", end: "2026-10-07T15:00:00.000Z",
        });
    });

    it("all이면 기간 제한 없이 읽는다", async () => {
        const repo = repository([review(3, 1)]);
        expect(await listAdminReviews("all", repo)).toMatchObject({ date: "all", count: 1, averageRating: 3 });
        expect(repo.listForAdmin).toHaveBeenCalledWith(null);
    });

    it("후기 0건이면 평균 없이 빈 목록을 돌려준다", async () => {
        expect(await listAdminReviews("2026-10-08", repository([]))).toEqual({
            date: "2026-10-08", count: 0, averageRating: null, reviews: [],
        });
    });

    it.each(["2026-02-30", "bad", "", "2026-10-7"])("잘못된 날짜 %j는 저장소를 부르지 않고 400", async (date) => {
        const repo = repository([]);
        await expect(listAdminReviews(date, repo)).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
        expect(repo.listForAdmin).not.toHaveBeenCalled();
    });
});
