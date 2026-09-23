import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createServiceClient } from "@/infra/supabase/server";

afterEach(() => vi.unstubAllEnvs());
it("실제 SDK가 서버 런타임에서 네트워크 요청 없이 초기화된다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-test-key");
    const client = createServiceClient();
    expect(client.auth.admin.listUsers).toBeTypeOf("function");
    expect(client.from).toBeTypeOf("function");
});
