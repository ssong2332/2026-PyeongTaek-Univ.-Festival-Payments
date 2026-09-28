import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");
vi.mock("@/infra/repositories/csvOrderRepository");

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/stats/csv/route";
import { loadCsvOrders } from "@/infra/repositories/csvOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { requireAdmin } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";

const url = (query = "") => new NextRequest(`http://localhost/api/admin/stats/csv${query}`);

describe("GET /api/admin/stats/csv", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as never);
        vi.mocked(createServiceClient).mockReturnValue({} as never);
        vi.mocked(loadCsvOrders).mockResolvedValue([]);
    });

    it("requires an admin session before reading orders", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
        const response = await GET(url());
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(loadCsvOrders).not.toHaveBeenCalled();
    });

    it("downloads a UTF-8 BOM CSV with 13 headers and the festival default range", async () => {
        const response = await GET(url());
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
        expect(response.headers.get("content-disposition")).toBe(
            'attachment; filename="orders_2026-10-07_2026-10-08.csv"',
        );
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(vi.mocked(loadCsvOrders).mock.calls[0][1]).toEqual({ from: "2026-10-07", to: "2026-10-08" });
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(new TextDecoder().decode(bytes).trimEnd().split(",")).toHaveLength(13);
    });

    it("exports item snapshots and KST timestamps for an explicit range", async () => {
        vi.mocked(loadCsvOrders).mockResolvedValueOnce([{
            id: "order-1", pickupNumber: 10, createdAt: "2026-10-06T15:00:00Z",
            paymentMethod: "cash", status: "refunded", totalAmount: 3500,
            reason: "고객, 요청", paidAt: "2026-10-06T15:01:00Z", completedAt: null,
            items: [{ menuNameKo: "기본호떡", options: ["견과류"], quantity: 1, lineTotal: 3500 }],
        }]);
        const response = await GET(url("?from=2026-10-07&to=2026-10-07"));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-disposition")).toContain("orders_2026-10-07_2026-10-07.csv");
        expect(await response.text()).toContain('기본호떡,견과류,1,3500,현금,환불,"고객, 요청",3500');
    });

    it.each(["?from=2026-10-07", "?from=2026-02-30&to=2026-10-08",
        "?from=2026-10-09&to=2026-10-08", "?from=2026-10-07&from=2026-10-08&to=2026-10-08"])(
        "rejects an invalid date range: %s", async query => {
            const response = await GET(url(query));
            expect(response.status).toBe(400);
            expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
            expect(loadCsvOrders).not.toHaveBeenCalled();
        },
    );
});
