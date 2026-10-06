import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SupabaseSettingsRepository } from "@/infra/repositories/settingsRepository";
import { AppError, toErrorResponse } from "@/lib/api/errors";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("SupabaseSettingsRepository", () => {
    it("get()은 키에 해당하는 값을 반환한다", async () => {
        const mockMaybeSingle = vi.fn().mockResolvedValue({
            data: { value: "국민은행" },
            error: null,
        });
        const mockClient = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: mockMaybeSingle,
                    }),
                }),
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        const result = await repo.get("transfer.bank_name");

        expect(result).toBe("국민은행");
    });

    it("get() 호출 시 DB 에러가 발생하면 AppError(INTERNAL_ERROR)를 던지며 details에 원문이 노출되지 않는다", async () => {
        const rawDbErrorMessage = "FATAL: connection pool exhausted at postgresql://user:pass@db:5432/postgres";
        const mockClient = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: rawDbErrorMessage },
                        }),
                    }),
                }),
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        
        let caughtError: unknown;
        try {
            await repo.get("transfer.bank_name");
        } catch (e) {
            caughtError = e;
        }

        expect(caughtError).toBeInstanceOf(AppError);
        const appError = caughtError as AppError;
        expect(appError.code).toBe("INTERNAL_ERROR");
        expect(appError.status).toBe(500);
        // Architecture 5: DB 에러 메시지 원문은 details에 들어가지 않음
        expect(appError.details).toBeUndefined();

        // toErrorResponse 변환 시에도 고객 응답 본문에 원문이 절대 노출되지 않음
        const { envelope, status } = toErrorResponse(caughtError);
        expect(status).toBe(500);
        expect(envelope.error.code).toBe("INTERNAL_ERROR");
        expect(envelope.error.message).toBe("An internal server error occurred.");
        expect(envelope.error.details).toBeUndefined();
        expect(JSON.stringify(envelope)).not.toContain("connection pool exhausted");
    });

    it("getByPrefix()는 해당 접두사로 시작하는 모든 설정을 레코드 형태로 반환한다", async () => {
        const mockClient = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    like: vi.fn().mockResolvedValue({
                        data: [
                            { key: "transfer.bank_name", value: "카카오뱅크" },
                            { key: "transfer.account_number", value: "3333-01-123456" },
                        ],
                        error: null,
                    }),
                }),
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        const result = await repo.getByPrefix("transfer.");

        expect(result).toEqual({
            "transfer.bank_name": "카카오뱅크",
            "transfer.account_number": "3333-01-123456",
        });
    });

    it("setMany()는 여러 설정을 upsert하고 updated_by를 기록한다", async () => {
        const mockUpsert = vi.fn().mockResolvedValue({ error: null });
        const mockClient = {
            from: vi.fn().mockReturnValue({
                upsert: mockUpsert,
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        await repo.setMany(
            {
                "transfer.bank_name": "신한은행",
                "payment.expire_minutes": "15",
            },
            "user-123",
        );

        expect(mockClient.from).toHaveBeenCalledWith("app_settings");
        expect(mockUpsert).toHaveBeenCalledTimes(1);
        const rows = mockUpsert.mock.calls[0][0];
        expect(rows).toHaveLength(2);
        expect(rows[0].key).toBe("transfer.bank_name");
        expect(rows[0].value).toBe("신한은행");
        expect(rows[0].updated_by).toBe("user-123");
        expect(typeof rows[0].updated_at).toBe("string");
        expect(rows[1].key).toBe("payment.expire_minutes");
        expect(rows[1].value).toBe("15");
        expect(rows[1].updated_by).toBe("user-123");
    });

    it("setMany() 호출 시 DB 에러가 발생하면 AppError(INTERNAL_ERROR)를 던진다", async () => {
        const mockUpsert = vi.fn().mockResolvedValue({
            error: { message: "database constraint violation" },
        });
        const mockClient = {
            from: vi.fn().mockReturnValue({
                upsert: mockUpsert,
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        await expect(
            repo.setMany({ "transfer.bank_name": "우리은행" }),
        ).rejects.toMatchObject({
            code: "INTERNAL_ERROR",
            status: 500,
        });
    });
});

