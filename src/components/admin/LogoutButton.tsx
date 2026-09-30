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
            const { error } = await supabase.auth.signOut();

            if (error) {
                // signOut()은 실패를 throw 대신 { error }로 돌려줄 수 있고, 이때 세션이 남아 있을 수 있다
                setErrorMessage(LOGOUT_ERROR_MESSAGE);
                setLoading(false);
                return;
            }

            // 로그아웃이 성공했을 때만 로그인 화면으로 이동
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
                <span role="alert" aria-live="assertive" className="text-xs text-red-600">
                    {errorMessage}
                </span>
            )}
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 disabled:opacity-50 transition-colors"
            >
                {loading ? "로그아웃 중..." : "로그아웃"}
            </button>
        </div>
    );
}
