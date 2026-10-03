import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

vi.mock("server-only", () => ({}));

const mockRequireAdmin = vi.fn();
vi.mock("@/infra/supabase/session", () => ({
    requireAdmin: () => mockRequireAdmin(),
}));

const mockGetAll = vi.fn();
const mockSetMany = vi.fn();

vi.mock("@/infra/repositories/settingsRepository", () => {
    return {
        SupabaseSettingsRepository: vi.fn(function () {
            return {
                getAll: mockGetAll,
                setMany: mockSetMany,
            };
        }),
    };
});

describe("Admin Settings API Route (/api/admin/settings)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAdmin.mockResolvedValue({ id: "admin-user-uuid" });
    });

    describe("GET /api/admin/settings", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            mockRequireAdmin.mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const { GET } = await import("@/app/api/admin/settings/route");
            const response = await GET();

            expect(response.status).toBe(401);
            const body = await response.json();
            expect(body.error.code).toBe("UNAUTHORIZED");
        });

        it("인증된 관리자 요청 시 200과 전체 설정을 반환한다", async () => {
            const currentSettings = {
                "transfer.bank_name": "토스뱅크",
                "transfer.account_number": "1000-01-123456",
                "transfer.account_holder": "홍길동",
                "auto_complete.enabled": "false",
                "auto_complete.minutes": "10",
                "payment.expire_minutes": "10",
            };
            mockGetAll.mockResolvedValueOnce(currentSettings);

            const { GET } = await import("@/app/api/admin/settings/route");
            const response = await GET();

            expect(response.status).toBe(200);
            expect(response.headers.get("Cache-Control")).toContain("no-store");
            const body = await response.json();
            expect(body.settings).toEqual(currentSettings);
        });
    });

    describe("PUT /api/admin/settings", () => {
        it("인증되지 않은 사용자는 401 UNAUTHORIZED 에러를 받는다", async () => {
            mockRequireAdmin.mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));

            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ settings: { "transfer.bank_name": "국민은행" } }),
                }),
            );

            expect(response.status).toBe(401);
            expect(mockSetMany).not.toHaveBeenCalled();
        });

        it("정상적인 부분 갱신 요청 시 200과 최신 전체 설정을 반환한다", async () => {
            mockSetMany.mockResolvedValueOnce(undefined);
            const allSettingsAfterUpdate = {
                "transfer.bank_name": "국민은행",
                "transfer.account_number": "111-222",
                "transfer.account_holder": "관리자",
                "payment.expire_minutes": "15",
                "auto_complete.enabled": "true",
                "auto_complete.minutes": "20",
            };
            mockGetAll.mockResolvedValueOnce(allSettingsAfterUpdate);

            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        settings: {
                            "transfer.bank_name": "국민은행",
                            "payment.expire_minutes": "15",
                        },
                    }),
                }),
            );

            expect(response.status).toBe(200);
            expect(mockSetMany).toHaveBeenCalledWith(
                {
                    "transfer.bank_name": "국민은행",
                    "payment.expire_minutes": "15",
                },
                "admin-user-uuid",
            );
            const body = await response.json();
            expect(body.settings).toEqual(allSettingsAfterUpdate);
        });

        it("계좌 정보 3항목의 빈 문자열(=미입력 상태) 저장을 허용한다", async () => {
            mockSetMany.mockResolvedValueOnce(undefined);
            mockGetAll.mockResolvedValueOnce({
                "transfer.bank_name": "",
                "transfer.account_number": "",
                "transfer.account_holder": "",
            });

            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        settings: {
                            "transfer.bank_name": "",
                            "transfer.account_number": "",
                            "transfer.account_holder": "",
                        },
                    }),
                }),
            );

            expect(response.status).toBe(200);
            expect(mockSetMany).toHaveBeenCalledWith(
                {
                    "transfer.bank_name": "",
                    "transfer.account_number": "",
                    "transfer.account_holder": "",
                },
                "admin-user-uuid",
            );
        });

        it("알 수 없는 설정 키가 전달되면 400 VALIDATION_ERROR를 반환하고 저장을 거부한다", async () => {
            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        settings: {
                            "unknown.hacker_setting": "malicious",
                        },
                    }),
                }),
            );

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error.code).toBe("VALIDATION_ERROR");
            expect(mockSetMany).not.toHaveBeenCalled();
        });

        it.each([
            ["payment.expire_minutes", "0"],
            ["payment.expire_minutes", "121"],
            ["payment.expire_minutes", "-10"],
            ["payment.expire_minutes", "abc"],
            ["auto_complete.minutes", "0"],
            ["auto_complete.minutes", "125"],
            ["auto_complete.enabled", "yes"],
            ["auto_complete.enabled", "1"],
            ["transfer.bank_name", "a".repeat(201)],
        ])("키 %s에 유효하지 않은 값 '%s' 전달 시 400 VALIDATION_ERROR를 반환한다", async (key, invalidVal) => {
            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        settings: { [key]: invalidVal },
                    }),
                }),
            );

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error.code).toBe("VALIDATION_ERROR");
            expect(mockSetMany).not.toHaveBeenCalled();
        });

        it("JSON 형식이 아니거나 settings 필드가 누락되면 400 VALIDATION_ERROR를 반환한다", async () => {
            const { PUT } = await import("@/app/api/admin/settings/route");
            const response = await PUT(
                new Request("http://localhost/api/admin/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ invalid: true }),
                }),
            );

            expect(response.status).toBe(400);
            const body = await response.json();
            expect(body.error.code).toBe("VALIDATION_ERROR");
            expect(mockSetMany).not.toHaveBeenCalled();
        });
    });
});
