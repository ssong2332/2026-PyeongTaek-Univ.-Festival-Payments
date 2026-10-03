import { LogoutButton } from "@/components/admin/LogoutButton";
import Link from "next/link";

export function AdminShell({ email, children }: { email?: string | null; children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-brand-deep sticky top-0 z-30 shadow-xs">
                <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-white tracking-tight">
                            평택대 부스 관리자
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium">
                            운영진
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        {email && (
                            <span className="text-xs text-amber-100 hidden sm:inline-block">
                                {email}
                            </span>
                        )}
                        <LogoutButton />
                    </div>
                </div>
            </header>

            <nav aria-label="운영 화면 이동" className="flex gap-5 border-b bg-white px-4 py-3 text-sm font-medium sm:px-6">
                <Link href="/admin" className="text-brand-deep hover:underline">주문 관리</Link>
                <Link href="/admin/shifts" className="text-brand-deep hover:underline">교대 스케줄</Link>
            </nav>
            <main className="flex-1 flex flex-col w-full">
                {children}
            </main>
        </div>
    );
}
