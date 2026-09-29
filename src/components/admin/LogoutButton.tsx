"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminBrowserClient } from "@/infra/supabase/browser";

export function LogoutButton() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    async function handleLogout() {
        if (loading) return;
        setLoading(true);

        try {
            const supabase = createAdminBrowserClient();
            await supabase.auth.signOut();
            router.push("/admin/login");
            router.refresh();
        } catch {
            setLoading(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-md font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 disabled:opacity-50 transition-colors"
        >
            {loading ? "로그아웃 중..." : "로그아웃"}
        </button>
    );
}
