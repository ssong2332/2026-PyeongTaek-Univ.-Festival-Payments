import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: vi.fn().mockReturnValue({}),
}));
vi.mock("@/infra/repositories/supabaseOrderRepository", () => ({
    createSupabaseOrderRepository: vi.fn().mockReturnValue({}),
}));
vi.mock("@/services/orderService");

import { GET as getQueue } from "@/app/api/queue/route";
import { getQueueStatus } from "@/services/orderService";

describe("GET /api/queue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("대기열 현황을 조회하여 200과 { waitingCount }를 반환한다", async () => {
        vi.mocked(getQueueStatus).mockResolvedValueOnce({ waitingCount: 7 });

        const res = await getQueue();

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data).toEqual({ waitingCount: 7 });
        expect(getQueueStatus).toHaveBeenCalledWith(expect.any(Object));
    });
});
