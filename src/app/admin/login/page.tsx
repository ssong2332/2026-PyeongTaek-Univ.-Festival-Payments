"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAdminBrowserClient } from "@/infra/supabase/browser";

export default function AdminLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const isFormValid = email.trim().length > 0 && password.length > 0;

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!isFormValid || submitting) return;

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const supabase = createAdminBrowserClient();
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (error) {
                // F-20: 잘못된 자격 증명 시 오류 표시 + 미로그인 유지
                setErrorMessage("이메일 또는 비밀번호가 올바르지 않습니다.");
                setSubmitting(false);
                return;
            }

            // 로그인 성공 시 관리자 대시보드로 이동
            router.push("/admin");
            router.refresh();
        } catch {
            setErrorMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
            <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-gray-200 p-8 space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                        관리자 로그인
                    </h1>
                    <p className="text-sm text-gray-500">
                        평택대 축제 부스 주문·결제 관리 시스템
                    </p>
                </div>

                {errorMessage && (
                    <div
                        role="alert"
                        aria-live="assertive"
                        className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
                    >
                        {errorMessage}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <div className="space-y-1">
                        <label
                            htmlFor="admin-email"
                            className="block text-sm font-medium text-gray-700"
                        >
                            이메일
                        </label>
                        <input
                            id="admin-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            disabled={submitting}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@ptu.ac.kr"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor="admin-password"
                            className="block text-sm font-medium text-gray-700"
                        >
                            비밀번호
                        </label>
                        <input
                            id="admin-password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            disabled={submitting}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!isFormValid || submitting}
                        className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-xs text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? (
                            <span className="inline-flex items-center gap-2">
                                <svg
                                    className="animate-spin h-4 w-4 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8v8H4z"
                                    />
                                </svg>
                                로그인 중...
                            </span>
                        ) : (
                            "로그인"
                        )}
                    </button>
                </form>

                <div className="pt-2 text-center text-xs text-gray-400">
                    관리자 계정 발급 및 비밀번호 재설정은 총관리자에게 문의하세요.
                </div>
            </div>
        </main>
    );
}
