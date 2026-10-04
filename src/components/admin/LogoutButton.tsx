"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminBrowserClient } from "@/infra/supabase/browser";

const LOGOUT_ERROR_MESSAGE = "로그아웃에 실패했습니다. 다시 시도해 주세요.";

export function LogoutButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function handleLogout() {
        if (loading) return;
        setLoading(true);
        setErrorMessage(null);

        try {
            const supabase = createAdminBrowserClient();
            // 같은 계정을 여러 기기가 함께 쓰므로 이 기기 세션만 끝낸다 (DECISIONS #48)
            const { error } = await supabase.auth.signOut({ scope: "local" });

            if (error) {
                // signOut()은 실패를 throw 대신 { error }로 돌려줄 수 있고, 이때 세션이 남아 있을 수 있다
                setErrorMessage(LOGOUT_ERROR_MESSAGE);
                setLoading(false);
                return;
            }

            router.push("/admin/login");
            router.refresh();
        } catch {
            setErrorMessage(LOGOUT_ERROR_MESSAGE);
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center gap-2">
            {errorMessage && (
                <span role="alert" aria-live="assertive" className="text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded">
                    {errorMessage}
                </span>
            )}
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold text-brand-deep bg-peach hover:bg-badge border border-badge disabled:opacity-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
                {loading ? "로그아웃 중..." : "로그아웃"}
            </button>
        </div>
    );
}
