import Link from "next/link";
import { CustomerMotion } from "@/components/motion/CustomerMotion";

// 고객 화면 공통 틀(모바일 폭) — 야간 철판. 화면별 머리는 각 페이지가 그린다.
// 푸터 아래 여백은 하단 고정 행동 바(BottomBar)에 본문이 가리지 않게 하는 몫이다.
// 불티: 위치·속도·흔들림을 고정값으로 흩어 둔다(다시 그려도 같다).
const EMBERS = Array.from({ length: 24 }, (_, index) => ({
    left: `${(index * 37 + 11) % 100}%`,
    size: index % 7 === 0 ? 5 : 2 + (index % 3),
    duration: 8 + ((index * 7) % 9),
    delay: -((index * 13) % 17),
    drift: `${((index % 5) - 2) * 22}px`,
    hot: index % 4 === 0,
}));

export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <CustomerMotion>
            <div className="iron-bg relative min-h-dvh overflow-x-clip text-dough">
                <div aria-hidden="true" className="iron-grain pointer-events-none fixed inset-0 overflow-hidden">
                    {/* 바닥에 깔린 숯불 연기 */}
                    <span className="smoke-drift absolute -bottom-24 -left-1/4 h-64 w-[150%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(240,120,40,0.16),transparent)] blur-2xl" />
                    <span className="smoke-drift absolute -bottom-32 -left-1/3 h-72 w-[140%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(120,90,110,0.18),transparent)] blur-3xl [animation-delay:-13s]" />
                    {EMBERS.map((ember, index) => (
                        <span
                            key={index}
                            className={`ember-flicker absolute -bottom-4 rounded-full ${
                                ember.hot ? "bg-[#fff3c9] shadow-[0_0_10px_3px_rgba(255,170,60,0.9)]" : "bg-syrup shadow-[0_0_8px_2px_rgba(255,150,40,0.7)]"
                            }`}
                            style={
                                {
                                    left: ember.left,
                                    width: ember.size,
                                    height: ember.size,
                                    // 올라가기(ember)와 깜빡임(flicker) 두 애니메이션에 각각 시간을 준다
                                    animationDuration: `${ember.duration}s, ${0.6 + (index % 4) * 0.25}s`,
                                    animationDelay: `${ember.delay}s, 0s`,
                                    "--drift": ember.drift,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
                <div className="relative mx-auto flex min-h-dvh max-w-md flex-col">
                    <div className="flex-1">{children}</div>
                    <footer className="px-4 pt-10 pb-32 text-center text-xs text-dough-dim">
                        <Link href="/privacy" className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-syrup">
                            개인정보 안내
                        </Link>
                    </footer>
                </div>
            </div>
        </CustomerMotion>
    );
}
