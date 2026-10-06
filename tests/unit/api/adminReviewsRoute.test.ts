import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");
vi.mock("@/infra/repositories/supabaseReviewRepository");

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/reviews/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseAdminReviewRepository } from "@/infra/repositories/supabaseReviewRepository";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

const listForAdmin = vi.fn();
const review = {
    orderId: "11111111-1111-4111-8111-111111111111", pickupNumber: 7, manualNumber: null,
    rating: 4, text: "개인적인 후기 내용", createdAt: "2026-10-07T03:12:00.000Z",
};
const request = (query = "") => new NextRequest(`http://localhost:3000/api/admin/reviews${query}`);

describe("GET /api/admin/reviews", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as Awaited<ReturnType<typeof requireAdmin>>);
        vi.mocked(createSupabaseAdminReviewRepository).mockReturnValue({ listForAdmin });
        listForAdmin.mockResolvedValue([review]);
    });

    it("관리자 세션이 없으면 DB를 부르기 전에 401", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await GET(request("?date=all"));
        expect(response.status).toBe(401);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(listForAdmin).not.toHaveBeenCalled();
    });

    it("형식·달력이 틀린 날짜와 중복 date는 400", async () => {
        for (const query of ["?date=2026-02-30", "?date=bad", "?date=", "?date=all&date=2026-10-07"]) {
            const response = await GET(request(query));
            expect(response.status).toBe(400);
            expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
        }
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(listForAdmin).not.toHaveBeenCalled();
    });

    it("선택한 KST 날짜의 후기 목록·평균을 캐시 없이 돌려준다", async () => {
        const response = await GET(request("?date=2026-10-07"));
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await response.json()).toEqual({ date: "2026-10-07", count: 1, averageRating: 4, reviews: [review] });
        expect(createSupabaseAdminReviewRepository).toHaveBeenCalledWith(createServiceClient());
        expect(listForAdmin).toHaveBeenCalledWith({ start: "2026-10-06T15:00:00.000Z", end: "2026-10-07T15:00:00.000Z" });
    });

    it("후기 0건이면 평균 null·빈 목록", async () => {
        listForAdmin.mockResolvedValueOnce([]);
        const response = await GET(request("?date=all"));
        expect(await response.json()).toEqual({ date: "all", count: 0, averageRating: null, reviews: [] });
        expect(listForAdmin).toHaveBeenCalledWith(null);
    });

    it("date가 없으면 오늘(KST) 날짜로 조회", async () => {
        const now = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-06T15:05:00Z").getTime());
        try {
            const response = await GET(request());
            expect(response.status).toBe(200);
            expect((await response.json()).date).toBe("2026-10-07");
            expect(listForAdmin).toHaveBeenCalledWith({ start: "2026-10-06T15:00:00.000Z", end: "2026-10-07T15:00:00.000Z" });
        } finally {
            now.mockRestore();
        }
    });

    it("규격 밖 저장소 응답은 내보내지 않고, 오류 로그에 후기 텍스트를 남기지 않는다", async () => {
        const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
        try {
            listForAdmin.mockResolvedValueOnce([{ ...review, rating: 9 }]);
            const response = await GET(request("?date=all"));
            expect(response.status).toBe(500);
            expect(response.headers.get("Cache-Control")).toBe("private, no-store");
            const body = await response.json();
            expect(body.error.code).toBe("INTERNAL_ERROR");
            expect(JSON.stringify(body)).not.toContain(review.text);
            expect(JSON.stringify(error.mock.calls)).not.toContain(review.text);
        } finally {
            error.mockRestore();
        }
    });
});
