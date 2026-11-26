import { LogoutButton } from "@/components/admin/LogoutButton";
import Link from "next/link";
import { Phone } from "lucide-react";
import type { EmergencyContact } from "@/lib/emergencyContact";

// 관리자 화면 바깥 틀 — 맨 위 얇은 무쇠 띠(계정·화면 이동·로그아웃). 주문판 머리(로고·탭·시계)는 OrderDashboard가 그린다.
// 휴대폰 폭에서도 글자가 두 줄로 깨지지 않게 줄바꿈을 막고, 모자라면 제목만 말줄임한다.
// emergency가 있으면 그 아래에 "비상 시 학회장에게 전화" 줄을 두고, 누르면 바로 전화가 걸린다(tel:).
export function AdminShell({ email, emergency, children }: { email?: string | null; emergency?: EmergencyContact | null; children: React.ReactNode }) {
    return (
        <div className="iron-bg flex min-h-screen flex-col text-dough">
            <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 border-b border-iron-line bg-iron px-3 py-2 text-xs whitespace-nowrap sm:gap-x-4 sm:px-6">
                <span className="min-w-0 flex-1 truncate font-semibold text-dough sm:flex-none">평택대 부스 관리자</span>
                <span className="shrink-0 rounded-full bg-syrup/15 px-2 py-0.5 text-[11px] font-semibold text-syrup">운영진</span>
                {email && <span className="hidden font-num text-dough sm:inline-block">{email}</span>}
                <nav aria-label="운영 화면 이동" className="order-3 flex w-full items-center justify-between gap-3 font-semibold sm:order-none sm:ml-auto sm:w-auto sm:justify-start sm:gap-4">
                    <Link href="/admin" className="text-dough-dim transition-colors hover:text-syrup">
                        주문 관리
                    </Link>
                    <Link href="/admin/kitchen" className="text-dough-dim transition-colors hover:text-syrup">
                        조리 화면
                    </Link>
                    <Link href="/admin/manual-orders" className="text-dough-dim transition-colors hover:text-syrup">
                        수기 주문
                    </Link>
                    <Link href="/admin/shifts" className="text-dough-dim transition-colors hover:text-syrup">
                        교대 스케줄
                    </Link>
                </nav>
                <LogoutButton />
            </div>
            {emergency && (
                <a
                    href={emergency.tel}
                    aria-label={`비상 시 학회장에게 전화 ${emergency.display}`}
                    className="flex items-center gap-2 border-b border-chili/40 bg-chili/12 px-3 py-1.5 text-xs font-bold whitespace-nowrap text-chili transition-colors hover:bg-chili/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-chili sm:px-6"
                >
                    <Phone size={14} aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 truncate">비상 시 학회장에게 전화</span>
                    <span className="font-num shrink-0 text-dough">{emergency.display}</span>
                    <span className="ml-auto shrink-0 rounded-full bg-chili px-2.5 py-0.5 text-[11px] text-[#2a0f0a]">전화 걸기</span>
                </a>
            )}
            <main className="flex w-full flex-1 flex-col">{children}</main>
        </div>
    );
}
