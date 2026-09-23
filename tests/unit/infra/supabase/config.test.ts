import { describe, expect, it } from "vitest";
import { readPublicConfig, requireServerKey } from "@/infra/supabase/config";

describe("Supabase 연결 설정", () => {
    it("HTTPS 주소와 공개 키를 읽는다", () => {
        expect(readPublicConfig("https://example.supabase.co", "public-test-key")).toEqual({
            url: "https://example.supabase.co", key: "public-test-key",
        });
    });
    it("로컬 테스트 주소를 허용한다", () => {
        expect(readPublicConfig("http://127.0.0.1:54321", "public-test-key").url).toBe("http://127.0.0.1:54321");
    });
    it("설정값 앞뒤 공백을 제거한다", () => {
        expect(requireServerKey("  private-test-key  ")).toBe("private-test-key");
    });
    it.each([undefined, "", "  ", "https://your-project-ref.supabase.co", "invalid", "ftp://example.com", "http://example.com", "https://name:password@example.com", "https://example.com/?key=secret"])("잘못되거나 미입력된 주소를 거부한다: %s", (url) => {
        expect(() => readPublicConfig(url, "public-test-key")).toThrow("NEXT_PUBLIC_SUPABASE_URL");
    });
    it.each([undefined, "", "  ", "your-anon-key-here"])("미입력된 공개 키를 거부한다: %s", (key) => {
        expect(() => readPublicConfig("https://example.supabase.co", key)).toThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    });
    it.each([undefined, "", "  ", "your-service-role-key-here"])("미입력된 서버 키를 거부한다: %s", (key) => {
        expect(() => requireServerKey(key)).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    });
    it("공개 키 자리에 서버 비밀 키를 넣으면 값 노출 없이 거부한다", () => {
        expect(() => readPublicConfig("https://example.supabase.co", "sb_secret_private-test-key")).toThrow("공개 키");
        try { readPublicConfig("https://example.supabase.co", "sb_secret_private-test-key"); }
        catch (error) { expect(String(error)).not.toContain("private-test-key"); }
    });
    it("기존 service_role 형식의 키도 공개 키로 사용하지 못한다", () => {
        const payload = btoa(JSON.stringify({ role: "service_role" }));
        expect(() => readPublicConfig("https://example.supabase.co", `header.${payload}.signature`)).toThrow("공개 키");
    });

});
