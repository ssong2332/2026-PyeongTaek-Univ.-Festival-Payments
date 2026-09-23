"use client";

import { createBrowserClient } from "@supabase/ssr";
import { readPublicConfig } from "./config";

// 관리자 로그인·Realtime 구독 전용. 고객 화면의 데이터 요청은 /api를 사용한다.
export function createAdminBrowserClient() {
    const config = readPublicConfig(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    return createBrowserClient(config.url, config.key);
}
