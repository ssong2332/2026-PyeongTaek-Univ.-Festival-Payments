import { CustomerFooter } from "@/components/customer/CustomerFooter";
import { DocumentLang } from "@/components/customer/LanguageToggle";
import { CustomerMotion } from "@/components/motion/CustomerMotion";
import { DemoBadge } from "@/features/demo/DemoBadge";
import { FestivalStage } from "@/features/festival/FestivalStage";

// 고객 화면 공통 틀(모바일 폭) — 야간 철판. 화면별 머리는 각 페이지가 그린다.
// 푸터 아래 여백은 하단 고정 행동 바(BottomBar)에 본문이 가리지 않게 하는 몫이다.
// festival-root: 휴대폰 시각에 따라 바탕·글씨 토큰이 아침 크림빛 → 16시 무쇠로 바뀐다(globals.css, festivalTheme).
// 장식(하늘·연기·불티·축제 무대 캔버스)은 모두 z-0, 본문은 z-10 — 이펙트가 내용과 버튼을 가리지 않는다.
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
            <DemoBadge />
            <DocumentLang />
            <div className="festival-root iron-bg relative min-h-dvh overflow-x-clip text-dough">
                <div aria-hidden="true" className="iron-grain pointer-events-none fixed inset-0 z-0 overflow-hidden">
                    <span className="festival-sky absolute inset-0" />
                    {/* 바닥에 깔린 숯불 연기 */}
                    <span className="smoke-drift absolute -bottom-24 -left-1/4 h-64 w-[150%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(240,120,40,0.16),transparent)] blur-2xl" />
                    <span className="festival-embers absolute inset-0">
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
                    </span>
                </div>
                <FestivalStage />
                <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col">
                    <div className="flex-1">{children}</div>
                    <CustomerFooter />
                </div>
            </div>
        </CustomerMotion>
    );
}
