import { afterEach, expect, it, vi } from "vitest";
vi.mock("@supabase/ssr", () => ({ createBrowserClient: vi.fn(() => ({ marker: "browser-client" })) }));
import { createBrowserClient } from "@supabase/ssr";
import { createAdminBrowserClient } from "@/infra/supabase/browser";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("관리자 브라우저는 공개 키만 사용한다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-key");
    createAdminBrowserClient();
    expect(createBrowserClient).toHaveBeenCalledWith("https://example.supabase.co", "public-test-key");
});
