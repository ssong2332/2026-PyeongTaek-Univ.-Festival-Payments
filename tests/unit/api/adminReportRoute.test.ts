import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");
vi.mock("@/infra/repositories/supabaseReportRepository");

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/report/route";
import { aggregateStats, type StatsOrder } from "@/domain/stats/aggregate";
import { createSupabaseReportRepository } from "@/infra/repositories/supabaseReportRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";
import { OperationsReportSchema } from "@/lib/dto/report";
import type { ReportRepository } from "@/services/reportPorts";

const MENU = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let orders: StatsOrder[] = [];
let repository: ReportRepository;
const request = (query = "") => new NextRequest(`http://localhost/api/admin/report${query}`);

describe("GET /api/admin/report", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        orders = [{ id: "o1", status: "completed", totalAmount: 7000, createdAt: "2026-10-07T01:00:00Z",
            items: [{ menuItemId: MENU, nameKo: "기본호떡", quantity: 2 }] }];
        repository = {
            loadDailyStats: vi.fn(async (date: string) => aggregateStats(orders, date)),
            listReviews: vi.fn(async () => []),
        };
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as Awaited<ReturnType<typeof requireAdmin>>);
        vi.mocked(createServiceClient).mockReturnValue({} as ReturnType<typeof createServiceClient>);
        vi.mocked(createSupabaseReportRepository).mockImplementation(() => repository);
    });

    it("rejects a missing admin session before touching the database", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await GET(request());
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(createSupabaseReportRepository).not.toHaveBeenCalled();
    });

    it("reports the festival dates by default without caching", async () => {
        const response = await GET(request());
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        const body = await response.json();
        expect(OperationsReportSchema.safeParse(body).success).toBe(true);
        expect(body).toMatchObject({
            from: "2026-10-07", to: "2026-10-08", isEmpty: false, periodTotal: { sales: 7000 },
            reviews: { count: 0, averageRating: null, items: [] },
        });
        expect(vi.mocked(repository.loadDailyStats).mock.calls).toEqual([["2026-10-07"], ["2026-10-08"]]);
        expect(createSupabaseReportRepository).toHaveBeenCalledWith(createServiceClient());
    });

    it("reports an explicit range and marks an orderless period as empty", async () => {
        orders = [];
        const response = await GET(request("?from=2026-10-08&to=2026-10-08"));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ from: "2026-10-08", to: "2026-10-08", isEmpty: true, periodTotal: { sales: 0 } });
        expect(body.days).toHaveLength(1);
        expect(vi.mocked(repository.loadDailyStats).mock.calls).toEqual([["2026-10-08"]]);
    });

    it.each([
        "?from=2026-10-07", "?to=2026-10-08", "?from=all&to=all", "?from=2026-10-09&to=2026-10-08",
        "?from=2026-02-30&to=2026-03-01", "?from=2026-10-07&from=2026-10-08&to=2026-10-08",
        "?from=2026-10-01&to=2026-11-01",
    ])("rejects an invalid range %s before touching the database", async query => {
        const response = await GET(request(query));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(createSupabaseReportRepository).not.toHaveBeenCalled();
    });

    it("does not expose an invalid database aggregate", async () => {
        vi.mocked(repository.loadDailyStats).mockImplementation(async date => ({ ...aggregateStats(orders, date), sales: -1 }));
        const response = await GET(request());
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe("INTERNAL_ERROR");
        expect(body.error.details).toBeUndefined();
    });
});
