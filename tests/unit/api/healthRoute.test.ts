import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockLimit = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
const mockCreateServiceClient = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/infra/supabase/server", () => ({
    createServiceClient: () => mockCreateServiceClient(),
}));

describe("GET /api/health", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("DB 연결이 정상일 때 200과 { ok: true, db: true, time }을 반환한다", async () => {
        mockLimit.mockResolvedValueOnce({ data: [{ key: "app.name" }], error: null });

        const { GET } = await import("@/app/api/health/route");
        const response = await GET();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.ok).toBe(true);
        expect(body.db).toBe(true);
        expect(typeof body.time).toBe("string");
    });

    it("DB 조회 실패(error 반환) 시 503과 { ok: false, db: false, time }을 반환한다", async () => {
        mockLimit.mockResolvedValueOnce({
            data: null,
            error: { message: "Database connection failed" },
        });

        const { GET } = await import("@/app/api/health/route");
        const response = await GET();

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.ok).toBe(false);
        expect(body.db).toBe(false);
        expect(typeof body.time).toBe("string");
    });

    it("클라이언트 생성 또는 내부 예외 발생 시 503과 { ok: false, db: false, time }을 반환한다", async () => {
        mockLimit.mockRejectedValueOnce(new Error("Network timeout"));

        const { GET } = await import("@/app/api/health/route");
        const response = await GET();

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.ok).toBe(false);
        expect(body.db).toBe(false);
        expect(typeof body.time).toBe("string");
    });
});
