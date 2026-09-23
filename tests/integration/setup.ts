import { vi } from "vitest";

vi.mock("server-only", () => ({}));
const url = process.env.SUPABASE_URL;
if (!url || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
    throw new Error("통합 테스트는 로컬 Supabase에서만 실행할 수 있습니다. SUPABASE_URL을 확인하세요.");
}
process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
