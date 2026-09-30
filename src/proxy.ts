import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readPublicConfig } from "@/infra/supabase/config";

// getUser()가 갱신·삭제한 세션 쿠키는 supabaseResponse에만 있으므로 redirect 응답으로 옮긴다
function redirectWithSessionCookies(
    request: NextRequest,
    supabaseResponse: NextResponse,
    pathname: string,
) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
}

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const config = readPublicConfig(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

    const supabase = createServerClient(config.url, config.key, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) =>
                    request.cookies.set(name, value),
                );
                supabaseResponse = NextResponse.next({
                    request,
                });
                cookiesToSet.forEach(({ name, value, options }) =>
                    supabaseResponse.cookies.set(name, value, options),
                );
            },
        },
    });

    // Architecture 8절: 세션 갱신 및 검사
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // 비로그인 사용자: /admin/(?!login) 접근 시 /admin/login으로 리다이렉트
    if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
        if (!user) {
            return redirectWithSessionCookies(request, supabaseResponse, "/admin/login");
        }
    }

    // 이미 로그인된 사용자: /admin/login 접근 시 /admin으로 리다이렉트
    if (pathname === "/admin/login" && user) {
        return redirectWithSessionCookies(request, supabaseResponse, "/admin");
    }

    return supabaseResponse;
}

export const config = {
    matcher: ["/admin/:path*"],
};

