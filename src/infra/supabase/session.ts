import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { readPublicConfig } from "./config";
import { AppError } from "@/lib/api/errors";
import type { User } from "@supabase/supabase-js";

export async function createSessionClient() {
    const cookieStore = await cookies();
    const config = readPublicConfig(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

    return createServerClient(config.url, config.key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    // Server Component or read-only context fallback
                }
            },
        },
    });
}

/**
 * Architecture 7절 / 8절: 관리자 API 및 라우트 세션 확인
 * 세션이 없거나 유효하지 않으면 401 UNAUTHORIZED 에러를 던진다.
 */
export async function requireAdmin(): Promise<User> {
    const supabase = await createSessionClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        throw new AppError("UNAUTHORIZED", 401);
    }

    return user;
}
