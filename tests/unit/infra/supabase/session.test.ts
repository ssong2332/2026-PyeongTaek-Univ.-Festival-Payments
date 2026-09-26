import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requireAdmin } from "@/infra/supabase/session";

const mockGetUser = vi.fn();
const mockCookieStore = {
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
};

vi.mock("next/headers", () => ({
    cookies: vi.fn().mockImplementation(async () => mockCookieStore),
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: vi.fn().mockImplementation(() => ({
        auth: {
            getUser: mockGetUser,
        },
    })),
}));

describe("infra/supabase/session", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
        vi.clearAllMocks();
    });
    it("유효한 세션이 있으면 사용자(User)를 반환한다", async () => {
        const fakeUser = { id: "admin-uuid-1234", email: "admin@ptu.ac.kr" };
        mockGetUser.mockResolvedValueOnce({
            data: { user: fakeUser },
            error: null,
        });

        const user = await requireAdmin();
        expect(user).toEqual(fakeUser);
    });

    it("세션이 없거나 에러가 있으면 401 UNAUTHORIZED 에러를 던진다", async () => {
        mockGetUser.mockResolvedValue({
            data: { user: null },
            error: { message: "No session" },
        });

        await expect(requireAdmin()).rejects.toMatchObject({
            code: "UNAUTHORIZED",
            status: 401,
        });
    });
});
