"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HotteokMascot } from "@/components/ui/HotteokMascot";
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
        <main className="min-h-screen flex items-center justify-center bg-cream bg-[radial-gradient(circle_at_85%_8%,#ffe9dc,transparent_45%)] px-4 py-16">
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-[0_18px_45px_rgba(91,55,39,0.1)] border border-line px-8 pt-14 pb-8 space-y-6">
                <HotteokMascot variant="chef" size={84} motion="bob" className="absolute -top-11 left-1/2 -ml-[42px]" />
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-extrabold text-brand-deep tracking-tight">
                        관리자 로그인
                    </h1>
                    <p className="text-sm text-stone-500">
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
                            className="block text-sm font-semibold text-brand-deep"
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
                            className="w-full px-3 py-2.5 border border-line rounded-xl bg-[#fffaf7] focus:outline-hidden focus:ring-2 focus:ring-brand focus:border-brand text-sm disabled:bg-stone-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor="admin-password"
                            className="block text-sm font-semibold text-brand-deep"
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
                            className="w-full px-3 py-2.5 border border-line rounded-xl bg-[#fffaf7] focus:outline-hidden focus:ring-2 focus:ring-brand focus:border-brand text-sm disabled:bg-stone-100 disabled:cursor-not-allowed"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!isFormValid || submitting}
                        className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-linear-to-r from-[#b4432a] to-orange-700 shadow-[0_12px_26px_rgba(180,67,42,0.22)] hover:brightness-105 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed transition"
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

                <div className="pt-2 text-center text-xs text-stone-500">
                    관리자 계정 발급 및 비밀번호 재설정은 총관리자에게 문의하세요.
                </div>
            </div>
        </main>
    );
}
