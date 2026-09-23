import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SupabaseSettingsRepository } from "@/infra/repositories/settingsRepository";
import { AppError } from "@/lib/api/errors";
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

    it("get() 호출 시 DB 에러가 발생하면 AppError(INTERNAL_ERROR)를 던진다", async () => {
        const mockClient = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: "DB connection timeout" },
                        }),
                    }),
                }),
            }),
        } as unknown as SupabaseClient;

        const repo = new SupabaseSettingsRepository(mockClient);
        await expect(repo.get("transfer.bank_name")).rejects.toThrow(AppError);
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
});
