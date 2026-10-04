import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session");
vi.mock("@/infra/supabase/server");

import { POST } from "@/app/api/admin/sweep/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";

const rpc = vi.fn();

describe("POST /api/admin/sweep", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as never);
        vi.mocked(createServiceClient).mockReturnValue({ rpc } as never);
    });

    it("관리자 세션이 없으면 RPC를 실행하지 않는다", async () => {
        vi.mocked(requireAdmin).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

        const response = await POST();

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(createServiceClient).not.toHaveBeenCalled();
        expect(rpc).not.toHaveBeenCalled();
    });

    it("관리자 요청은 현재 시각 기본값으로 스윕하고 두 건수를 반환한다", async () => {
        rpc.mockResolvedValueOnce({ data: { expired: 2, completed: 1 }, error: null });

        const response = await POST();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ expired: 2, completed: 1 });
        expect(rpc).toHaveBeenCalledExactlyOnceWith("sweep_order_timeouts");
    });

    it("DB 오류나 예상 밖 응답은 내부 정보 없이 500으로 반환한다", async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { message: "secret db detail" } });
        rpc.mockResolvedValueOnce({ data: { expired: -1, completed: 0 }, error: null });

        for (let i = 0; i < 2; i++) {
            const response = await POST();
            const body = await response.json();
            expect(response.status).toBe(500);
            expect(body.error.code).toBe("INTERNAL_ERROR");
            expect(JSON.stringify(body)).not.toContain("secret db detail");
        }
    });
});
