"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
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
        <main className="iron-bg flex min-h-screen items-center justify-center px-4 py-16 text-dough">
            <div className="iron-card relative w-full max-w-md space-y-6 rounded-3xl px-8 pt-10 pb-8 shadow-[0_30px_70px_rgba(0,0,0,0.55)]">
                <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-[#ffd58a] via-syrup to-syrup-2 text-molasses shadow-[0_0_30px_rgba(255,181,71,0.4)]"><Flame size={26} /></span>
                <div className="text-center space-y-2">
                    <h1 className="font-display text-3xl text-dough">
                        관리자 로그인
                    </h1>
                    <p className="text-sm text-dough-dim">
                        평택대 축제 부스 주문·결제 관리 시스템
                    </p>
                </div>

                {errorMessage && (
                    <div
                        role="alert"
                        aria-live="assertive"
                        className="rounded-lg border border-chili/45 bg-chili/10 p-3 text-sm text-chili"
                    >
                        {errorMessage}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <div className="space-y-1">
                        <label
                            htmlFor="admin-email"
                            className="block text-sm font-semibold text-dough"
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
                            className="w-full rounded-xl border border-iron-line bg-iron px-3 py-3 text-sm text-dough placeholder:text-dough-dim/60 focus:border-syrup/70 focus:ring-4 focus:ring-syrup/15 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor="admin-password"
                            className="block text-sm font-semibold text-dough"
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
                            className="w-full rounded-xl border border-iron-line bg-iron px-3 py-3 text-sm text-dough placeholder:text-dough-dim/60 focus:border-syrup/70 focus:ring-4 focus:ring-syrup/15 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!isFormValid || submitting}
                        className="syrup-btn sheen flex w-full items-center justify-center rounded-xl px-4 py-3.5 text-sm font-bold transition-transform active:scale-[0.98] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-syrup disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting ? (
                            <span className="inline-flex items-center gap-2">
                                <svg
                                    className="h-4 w-4 animate-spin"
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

                <div className="pt-2 text-center text-xs text-dough-dim">
                    관리자 계정 발급 및 비밀번호 재설정은 총관리자에게 문의하세요.
                </div>
            </div>
        </main>
    );
}
