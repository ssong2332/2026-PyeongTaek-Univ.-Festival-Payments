import { redirect } from "next/navigation";
import { createSessionClient } from "@/infra/supabase/session";
import { LogoutButton } from "@/components/admin/LogoutButton";

export default async function AdminProtectedLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createSessionClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    // Architecture 8절: 세션 없으면 /admin/login 리다이렉트
    if (error || !user) {
        redirect("/admin/login");
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-gray-900 tracking-tight">
                            평택대 부스 관리자
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
                            운영진
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 hidden sm:inline-block">
                            {user.email}
                        </span>
                        <LogoutButton />
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
                {children}
            </main>
        </div>
    );
}
