import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readPublicConfig } from "@/infra/supabase/config";

export async function middleware(request: NextRequest) {
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
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = "/admin/login";
            return NextResponse.redirect(loginUrl);
        }
    }

    // 이미 로그인된 사용자: /admin/login 접근 시 /admin으로 리다이렉트
    if (pathname === "/admin/login" && user) {
        const dashboardUrl = request.nextUrl.clone();
        dashboardUrl.pathname = "/admin";
        return NextResponse.redirect(dashboardUrl);
    }

    return supabaseResponse;
}

export const config = {
    matcher: ["/admin/:path*"],
};
