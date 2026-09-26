import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
    cookies: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
    createServerClient: vi.fn(),
}));

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireAdmin, createSessionClient } from "@/infra/supabase/session";
import { AppError } from "@/lib/api/errors";

describe("infra/supabase/session", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    });

    it("쿠키 저장소를 이용해 createServerClient를 생성한다", async () => {
        const mockCookieStore = {
            getAll: vi.fn().mockReturnValue([{ name: "sb-token", value: "test" }]),
            set: vi.fn(),
        };
        vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as Awaited<ReturnType<typeof cookies>>);
        vi.mocked(createServerClient).mockReturnValue({} as unknown as ReturnType<typeof createServerClient>);

        await createSessionClient();

        expect(createServerClient).toHaveBeenCalledWith(
            "https://example.supabase.co",
            "anon-test-key",
            expect.objectContaining({ cookies: expect.any(Object) }),
        );
    });

    it("유효한 세션 유저가 있으면 user 객체를 반환한다", async () => {
        const mockUser = { id: "admin-1", email: "admin@example.com" };
        const mockSupabase = {
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: mockUser },
                    error: null,
                }),
            },
        };
        vi.mocked(cookies).mockResolvedValue({ getAll: vi.fn(), set: vi.fn() } as unknown as Awaited<ReturnType<typeof cookies>>);
        vi.mocked(createServerClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServerClient>);

        const user = await requireAdmin();

        expect(user).toEqual(mockUser);
    });

    it("세션이 없거나 에러가 발생하면 401 UNAUTHORIZED AppError를 던진다", async () => {
        const mockSupabase = {
            auth: {
                getUser: vi.fn().mockResolvedValue({
                    data: { user: null },
                    error: { message: "No session" },
                }),
            },
        };
        vi.mocked(cookies).mockResolvedValue({ getAll: vi.fn(), set: vi.fn() } as unknown as Awaited<ReturnType<typeof cookies>>);
        vi.mocked(createServerClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServerClient>);

        await expect(requireAdmin()).rejects.toThrow(AppError);
        await expect(requireAdmin()).rejects.toMatchObject({
            code: "UNAUTHORIZED",
            status: 401,
        });
    });
});
