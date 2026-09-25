import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ marker: "service-client" })) }));
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/infra/supabase/server";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("서버 전용 Supabase 연결", () => {
    it("공개 키 없이 서버 키로 생성하며 로그인 세션을 저장하지 않는다", () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-key");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
        createServiceClient();
        expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "private-test-key", {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
    });
    it("서버 키가 없으면 연결을 만들지 않는다", () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
        expect(() => createServiceClient()).toThrow("SUPABASE_SERVICE_ROLE_KEY");
        expect(createClient).not.toHaveBeenCalled();
    });
});
