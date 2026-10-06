import { LogoutButton } from "@/components/admin/LogoutButton";
import Link from "next/link";

// 관리자 화면 바깥 틀 — 맨 위 얇은 무쇠 띠(계정·화면 이동·로그아웃). 주문판 머리(로고·탭·시계)는 OrderDashboard가 그린다.
// 휴대폰 폭에서도 글자가 두 줄로 깨지지 않게 줄바꿈을 막고, 모자라면 제목만 말줄임한다.
export function AdminShell({ email, children }: { email?: string | null; children: React.ReactNode }) {
    return (
        <div className="iron-bg flex min-h-screen flex-col text-dough">
            <div className="flex h-10 items-center gap-2 border-b border-iron-line bg-iron px-3 text-xs whitespace-nowrap sm:gap-4 sm:px-6">
                <span className="min-w-0 truncate font-semibold text-dough">평택대 부스 관리자</span>
                <span className="shrink-0 rounded-full bg-syrup/15 px-2 py-0.5 text-[11px] font-semibold text-syrup">운영진</span>
                {email && <span className="hidden font-num text-dough sm:inline-block">{email}</span>}
                <nav aria-label="운영 화면 이동" className="ml-auto flex shrink-0 items-center gap-3 font-semibold sm:gap-4">
                    <Link href="/admin" className="text-dough-dim transition-colors hover:text-syrup">
                        주문 관리
                    </Link>
                    <Link href="/admin/shifts" className="text-dough-dim transition-colors hover:text-syrup">
                        교대 스케줄
                    </Link>
                </nav>
                <LogoutButton />
            </div>
            <main className="flex w-full flex-1 flex-col">{children}</main>
        </div>
    );
}
