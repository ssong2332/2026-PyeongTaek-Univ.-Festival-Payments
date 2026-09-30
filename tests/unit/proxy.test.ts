import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

// @supabase/ssr 서버 클라이언트를 가짜로 바꿔 getUser() 결과와 세션 갱신(setAll 호출)만 흉내 낸다.
type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

const auth = vi.hoisted(() => ({
    user: null as { id: string } | null,
    refreshedCookies: [] as CookieToSet[],
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: (
        _url: string,
        _key: string,
        { cookies }: { cookies: { setAll: (cookiesToSet: CookieToSet[]) => void } },
    ) => ({
        auth: {
            getUser: async () => {
                if (auth.refreshedCookies.length > 0) cookies.setAll(auth.refreshedCookies);
                return { data: { user: auth.user }, error: null };
            },
        },
    }),
}));

const ORIGIN = "http://localhost:3000";
// @supabase/ssr DEFAULT_COOKIE_OPTIONS와 같은 값
const REFRESH_OPTIONS = { path: "/", sameSite: "lax", httpOnly: false, maxAge: 34_560_000 };

function request(pathname: string) {
    return new NextRequest(new URL(pathname, ORIGIN), {
        headers: { cookie: "sb-test-auth-token=old-session" },
    });
}

// Set-Cookie 한 줄 → 이름·값·속성. Expires는 Max-Age에서 매번 계산되는 값이라 비교에서 뺀다.
function parseSetCookie(line: string) {
    const [pair, ...attrs] = line.split("; ");
    const eq = pair.indexOf("=");
    return {
        name: pair.slice(0, eq),
        value: pair.slice(eq + 1),
        attrs: attrs.filter((attr) => !attr.startsWith("Expires=")).sort(),
    };
}

describe("proxy (관리자 라우트 보호)", () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "dummy-anon-key";
        auth.user = null;
        auth.refreshedCookies = [];
    });

    it.each(["/admin", "/admin/menus"])(
        "비로그인 사용자가 %s에 접근하면 /admin/login으로 리다이렉트한다",
        async (pathname) => {
            const response = await proxy(request(pathname));

            expect(response.status).toBe(307);
            expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/login`);
        },
    );

    it("비로그인 사용자의 /admin/login 접근은 리다이렉트하지 않는다 (루프 방지)", async () => {
        const response = await proxy(request("/admin/login"));

        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
    });

    it("로그인 사용자가 /admin/login에 접근하면 /admin으로 리다이렉트한다", async () => {
        auth.user = { id: "admin-1" };

        const response = await proxy(request("/admin/login"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
    });

    it("로그인 리다이렉트 응답에 getUser()가 갱신한 세션 쿠키를 옵션까지 그대로 싣는다 (삭제 쿠키 포함)", async () => {
        auth.user = { id: "admin-1" };
        // 세션 청크 수가 바뀌면 옛 쿠키 삭제(빈 값, Max-Age=0)와 새 청크가 한 번의 setAll로 함께 온다.
        auth.refreshedCookies = [
            { name: "sb-test-auth-token", value: "", options: { ...REFRESH_OPTIONS, maxAge: 0 } },
            { name: "sb-test-auth-token.0", value: "refreshed-part-0", options: REFRESH_OPTIONS },
            { name: "sb-test-auth-token.1", value: "refreshed-part-1", options: REFRESH_OPTIONS },
        ];

        const response = await proxy(request("/admin/login"));

        expect(response.headers.get("location")).toBe(`${ORIGIN}/admin`);
        const cookies = response.headers.getSetCookie().map(parseSetCookie)
            .sort((a, b) => a.name.localeCompare(b.name));
        expect(cookies).toEqual([
            { name: "sb-test-auth-token", value: "", attrs: ["Max-Age=0", "Path=/", "SameSite=lax"] },
            { name: "sb-test-auth-token.0", value: "refreshed-part-0", attrs: ["Max-Age=34560000", "Path=/", "SameSite=lax"] },
            { name: "sb-test-auth-token.1", value: "refreshed-part-1", attrs: ["Max-Age=34560000", "Path=/", "SameSite=lax"] },
        ]);
    });

    it("로그인 사용자의 /admin 접근은 통과시키고 갱신 쿠키를 응답에 싣는다", async () => {
        auth.user = { id: "admin-1" };
        auth.refreshedCookies = [
            { name: "sb-test-auth-token", value: "refreshed-session", options: REFRESH_OPTIONS },
        ];

        const response = await proxy(request("/admin"));

        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("x-middleware-next")).toBe("1");
        expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed-session");
    });
});
