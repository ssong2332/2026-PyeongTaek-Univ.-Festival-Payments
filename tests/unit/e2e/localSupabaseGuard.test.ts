import { describe, expect, test } from "vitest";
import { assertLocalSupabaseUrl, resolveE2eSupabase } from "../../e2e/support/localSupabase";

// T-24: E2E는 로컬 Supabase에서만 실행한다(ADR-0007). 운영·공용 DB 주소면 시작 전에 멈춘다.
const FILE = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("E2E 로컬 Supabase 가드", () => {
    test.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://127.0.0.1:54321/"])(
        "로컬 주소 %s 는 통과한다",
        (url) => {
            expect(assertLocalSupabaseUrl(url)).toBe(url.replace(/\/$/, ""));
        },
    );

    test.each([
        "https://abcdefghijkl.supabase.co",
        "https://127.0.0.1.example.com",
        "http://localhost.example.com:54321",
        "http://192.168.0.10:54321",
        "not-a-url",
        "",
        undefined,
    ])("로컬이 아닌 주소 %s 는 실행을 중단한다", (url) => {
        expect(() => assertLocalSupabaseUrl(url)).toThrow(/로컬 Supabase/);
    });

    test(".env.test.local 값을 개발 서버용 환경변수로 넘긴다", () => {
        expect(resolveE2eSupabase({}, FILE)).toEqual({
            url: "http://127.0.0.1:54321",
            anonKey: "anon",
            serviceRoleKey: "service",
            serverEnv: {
                NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
                NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
                SUPABASE_SERVICE_ROLE_KEY: "service",
            },
        });
    });

    test("셸에 운영 주소(NEXT_PUBLIC_SUPABASE_URL)가 잡혀 있으면 파일 값이 로컬이어도 중단한다", () => {
        expect(() => resolveE2eSupabase({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijkl.supabase.co" }, FILE))
            .toThrow(/로컬 Supabase/);
    });

    test(".env.test.local의 주소가 로컬이 아니면 중단한다", () => {
        expect(() => resolveE2eSupabase({}, { ...FILE, SUPABASE_URL: "https://abcdefghijkl.supabase.co" }))
            .toThrow(/로컬 Supabase/);
    });

    test.each(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const)(
        "%s 가 없으면 안내와 함께 중단한다",
        (key) => {
            expect(() => resolveE2eSupabase({}, { ...FILE, [key]: undefined })).toThrow(/\.env\.test\.local/);
        },
    );
});
