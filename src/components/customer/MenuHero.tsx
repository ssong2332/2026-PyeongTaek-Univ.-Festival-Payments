"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useState } from "react";
import { useCartBump } from "@/components/motion/cartBump";
import { SPRING } from "@/components/motion/presets";
import { CartIcon, FlameIcon } from "@/components/ui/icons";
import { FESTIVAL_ART } from "@/features/festival/festivalArt";
import { FestivalHorizon } from "@/features/festival/FestivalHorizon";
import { useT } from "@/lib/i18n/locale";
import { LanguageToggle } from "./LanguageToggle";

// 제목 위 연기 덩어리: 시작 위치·크기·흐르는 방향을 고정값으로 흩어 둔다(다시 그려도 같다).
const SMOKE_PUFFS = Array.from({ length: 9 }, (_, index) => ({
    left: `${8 + ((index * 23) % 78)}%`,
    top: `${30 + ((index * 17) % 40)}%`,
    size: 34 + ((index * 11) % 30),
    delay: -((index * 0.47) % 3.8),
    duration: 3.2 + (index % 4) * 0.45,
    drift: `${((index % 5) - 1.5) * 16}px`,
    alpha: (0.5 + (index % 3) * 0.14).toFixed(2),
}));

// 메뉴판 머리 — "호떡" 글자가 반죽처럼 떨어져 눌리고(drop), "부스" 딱지가 척 붙고(stick), 제목 위로 열기가 일렁이며 연기가 오른다.
// 스크롤하면 제목이 천천히 밀려나며 흐려지고, 머리를 지나면 위에 작은 바가 내려온다. 위쪽 진행 막대가 스크롤만큼 찬다.
export function MenuHero({ cartCount }: { cartCount: number }) {
    const { scrollY, scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
    const titleY = useTransform(scrollY, [0, 260], [0, 60]);
    const titleOpacity = useTransform(scrollY, [0, 220], [1, 0.15]);
    const t = useT();
    const [compact, setCompact] = useState(false);
    const [dropKey, setDropKey] = useState(0);
    useMotionValueEvent(scrollY, "change", (y) => setCompact(y > 240));

    return (
        <>
            <motion.div aria-hidden="true" style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-40 h-[3px] origin-left bg-linear-to-r from-caramel via-syrup to-[#ffe2a6]" />

            <header className="relative px-5 pt-5 pb-2">
                {/* 머리 위에 걸린 축제 전구 줄(Flaticon 그림) — 축제가 시작되면(14시~) 켜지고 살랑 흔들린다 */}
                <span
                    aria-hidden="true"
                    className="fest-fx-item pointer-events-none absolute inset-x-0 -top-3 h-14 origin-top"
                    style={{ "--th": 0.05 } as React.CSSProperties}
                >
                    <span className="fest-lights fest-swing fest-twinkle block size-full" style={{ "--src": `url(${FESTIVAL_ART.lightsString})` } as React.CSSProperties} />
                </span>
                <div className="relative flex items-center justify-between gap-3">
                    {/* 축제 입장권 딱지: 왼쪽 표 머리(연도) | 절취선 | 축제 이름 */}
                    <p className="fest-ticket min-w-0 -rotate-2 text-[13px] leading-none">
                        <span className="fest-ticket-stub font-num flex items-center px-2.5 py-2 text-[11px] font-bold tracking-wider">{t("hero.festivalYear")}</span>
                        <span className="font-display flex min-w-0 items-center truncate px-2.5 py-2">{t("hero.festivalName")}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <LanguageToggle />
                        <CartButton count={cartCount} />
                    </div>
                </div>

                <motion.div style={{ y: titleY, opacity: titleOpacity }} className="relative mt-6">
                    {/* 열기 아지랑이 필터(장식) — 난류 노이즈가 천천히 바뀌며 제목을 일렁이게 한다 */}
                    <svg aria-hidden="true" className="absolute size-0">
                        <filter id="heat-haze" x="-10%" y="-20%" width="120%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="3" result="noise">
                                <animate attributeName="baseFrequency" dur="6s" values="0.012 0.06;0.016 0.09;0.012 0.06" repeatCount="indefinite" />
                            </feTurbulence>
                            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                    </svg>
                    {/* 제목 위로 피어오르는 열기(장식) */}
                    <span aria-hidden="true" className="pointer-events-none absolute -top-10 left-0 flex gap-5">
                        {[0, 1, 2, 3, 4].map((index) => (
                            <span
                                key={index}
                                className="h-20 w-5 rounded-full bg-linear-to-t from-syrup/45 via-syrup-2/20 to-transparent blur-lg motion-safe:animate-steam"
                                style={{ animationDelay: `${index * -0.7}s`, animationDuration: `${2.8 + (index % 3) * 0.6}s` }}
                            />
                        ))}
                    </span>
                    {/* 불타는 글자 위로 연기가 뭉게뭉게 피어올라 옆으로 흩어진다(장식) */}
                    <span aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-24 w-52">
                        {SMOKE_PUFFS.map((puff, index) => (
                            <span
                                key={index}
                                className="smoke-puff title-smoke absolute rounded-full"
                                style={
                                    {
                                        left: puff.left,
                                        top: puff.top,
                                        width: puff.size,
                                        height: puff.size,
                                        animationDelay: `${puff.delay}s`,
                                        animationDuration: `${puff.duration}s`,
                                        "--smoke-drift": puff.drift,
                                        "--smoke-alpha": puff.alpha,
                                    } as React.CSSProperties
                                }
                            />
                        ))}
                    </span>
                    <h1 className="relative flex items-end gap-3">
                        {/* 글자를 누르면 다시 반죽처럼 떨어진다(장식 놀이). 줄 높이가 촘촘해 ㅎ 꼭지가 그라데이션 칠 밖으로 나가지 않게 글자 상자를 위로 늘린다(pt·-mt) */}
                        <span
                            key={dropKey}
                            onPointerDown={() => {
                                setDropKey((key) => key + 1);
                                try {
                                    navigator.vibrate?.(15);
                                } catch {
                                    // 진동이 없어도 화면 연출은 그대로다.
                                }
                            }}
                            className="heat-haze font-display relative cursor-pointer text-[96px] leading-[0.9] drop-shadow-[0_10px_30px_rgba(240,138,44,0.35)] select-none"
                        >
                            <span className="jelly syrup-text -mt-[0.18em] inline-block origin-bottom pt-[0.18em]" style={{ animationDelay: "0.05s, 2.2s" }}>
                                호
                            </span>
                            <span className="jelly syrup-text -mt-[0.18em] inline-block origin-bottom pt-[0.18em]" style={{ animationDelay: "0.18s, 2.45s" }}>
                                떡
                            </span>
                            {/* 바닥 그림자: 글자가 닿는 순간 납작하게 퍼진다 */}
                            <motion.span
                                aria-hidden="true"
                                className="absolute inset-x-2 -bottom-2 h-3 rounded-[50%] bg-black/50 blur-md"
                                initial={{ scaleX: 0.2, opacity: 0 }}
                                animate={{ scaleX: [0.2, 1.25, 1], opacity: [0, 0.9, 0.6] }}
                                transition={{ duration: 0.6, delay: 0.45, times: [0, 0.4, 1] }}
                            />
                            {/* 착지할 때 튀는 설탕 가루 */}
                            {Array.from({ length: 12 }, (_, index) => {
                                const left = index < 6;
                                const angle = (index % 6) / 5;
                                return (
                                    <motion.span
                                        key={index}
                                        aria-hidden="true"
                                        className="absolute bottom-0 size-1.5 rounded-full bg-[#ffe2a6]"
                                        style={{ left: left ? "22%" : "70%" }}
                                        initial={{ x: 0, y: 0, opacity: 0 }}
                                        animate={{ x: (angle - 0.5) * 90, y: [0, -30 - angle * 20, 6], opacity: [0, 1, 0] }}
                                        transition={{ duration: 0.7, delay: left ? 0.5 : 0.63, ease: "easeOut" }}
                                    />
                                );
                            })}
                        </span>{" "}
                        <span
                            className="font-display anim-stick mb-3 inline-block -rotate-6 rounded-xl bg-[#f7e8d0] px-3 py-1 text-2xl text-molasses shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
                            style={{ animationDelay: "0.75s" }}
                        >
                            {t("hero.sticker")}
                        </span>
                    </h1>
                    <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.9, type: "spring", stiffness: 300, damping: 26 }}
                        className="font-display mt-4 flex items-center gap-2 text-[17px] leading-snug text-dough"
                    >
                        <FlameIcon className="ember-flicker-soft size-[18px] shrink-0 text-syrup" />
                        <span>
                            {t("hero.taglineLead")}{" "}
                            <span className="syrup-swash syrup-text">
                                {t("hero.taglineAccent")}
                                <svg aria-hidden="true" viewBox="0 0 100 10" preserveAspectRatio="none">
                                    <path d="M2 7 C 25 2, 50 2, 72 5 S 94 8, 98 3" pathLength={1} fill="none" stroke="var(--color-syrup)" strokeWidth="2.6" strokeLinecap="round" />
                                </svg>
                            </span>
                        </span>
                    </motion.p>
                </motion.div>
                <FestivalHorizon />
            </header>

            {/* 머리를 지나면 내려오는 작은 바 — 제목은 h1이 이미 있으므로 문단으로 둔다 */}
            <AnimatePresence>
                {compact && (
                    <motion.div initial={{ y: -72 }} animate={{ y: 0 }} exit={{ y: -72 }} transition={SPRING} className="fixed inset-x-0 top-0 z-30">
                        <div className="mx-auto flex max-w-md items-center gap-3 border-b border-iron-line bg-iron/85 px-5 py-2.5 backdrop-blur-xl">
                            <p className="font-display syrup-text flex-1 text-xl">{t("hero.compactTitle")}</p>
                            <CartButton count={cartCount} compact />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function CartButton({ count, compact = false }: { count: number; compact?: boolean }) {
    const bump = useCartBump();
    const t = useT();
    return (
        <motion.div animate={bump} whileTap={{ scale: 0.9 }}>
            <Link
                href="/cart"
                aria-label={t("hero.cartLabel", { count })}
                data-cart-target={compact ? "compact" : "hero"}
                className={`iron-card relative flex items-center justify-center rounded-2xl text-dough focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup ${
                    compact ? "size-10" : "size-12"
                }`}
            >
                <CartIcon className={compact ? "size-5" : "size-6"} />
                <AnimatePresence>
                    {count > 0 && (
                        <motion.span
                            key={count}
                            initial={{ scale: 0.3, y: 6 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 600, damping: 12 }}
                            className="font-num absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-syrup px-1 text-[11px] font-medium text-molasses shadow-[0_0_10px_rgba(255,181,71,0.7)]"
                        >
                            {count}
                        </motion.span>
                    )}
                </AnimatePresence>
            </Link>
        </motion.div>
    );
}
