import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");
vi.mock("@/infra/repositories/statsRepository");

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/stats/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { loadStats } from "@/infra/repositories/statsRepository";
import { AppError } from "@/lib/api/errors";

const emptySummary = {
    date: "all", sales: 0, orderCount: 0, refundedAmount: 0, refundedCount: 0, byMenu: [],
    totals: { pending: 0, paid: 0, cooking: 0, completed: 0, cancelled: 0, refunded: 0, expired: 0 },
};
const request = (query = "") => new NextRequest(`http://localhost:3000/api/admin/stats${query}`);

describe("GET /api/admin/stats", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as Awaited<ReturnType<typeof requireAdmin>>);
        vi.mocked(loadStats).mockResolvedValue(emptySummary);
    });

    it("rejects a missing admin session before calling the database", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await GET(request("?date=all"));
        expect(response.status).toBe(401);
        expect(loadStats).not.toHaveBeenCalled();
    });

    it("rejects malformed, nonexistent, and repeated dates", async () => {
        for (const query of ["?date=2026-02-30", "?date=bad", "?date=all&date=2026-10-07"]) {
            const response = await GET(request(query));
            expect(response.status).toBe(400);
        }
        expect(createServiceClient).not.toHaveBeenCalled();
    });

    it("returns the validated aggregate without caching it", async () => {
        const response = await GET(request("?date=all"));
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        expect(await response.json()).toEqual(emptySummary);
        expect(loadStats).toHaveBeenCalledWith(createServiceClient(), "all");
    });

    it("accepts seeded menu IDs in an otherwise valid aggregate", async () => {
        const seededSummary = {
            ...emptySummary,
            byMenu: [{ menuItemId: "22222222-2222-2222-2222-222222222222", nameKo: "뿌링클 호떡", quantity: 1, ratio: 1 }],
        };
        vi.mocked(loadStats).mockResolvedValueOnce(seededSummary);

        const response = await GET(request("?date=all"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(seededSummary);
    });

    it("uses the KST calendar day when no date is specified", async () => {
        const now = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-28T15:05:00Z").getTime());
        try {
            const response = await GET(request());
            expect(response.status).toBe(200);
            expect(loadStats).toHaveBeenCalledWith(createServiceClient(), "2026-09-29");
        } finally {
            now.mockRestore();
        }
    });

    it("does not expose an invalid database response", async () => {
        vi.mocked(loadStats).mockResolvedValueOnce({ ...emptySummary, sales: -1 });
        const response = await GET(request("?date=all"));
        expect(response.status).toBe(500);
        expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    });
});
