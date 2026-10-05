"use client";

import Link from "next/link";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { useState } from "react";
import { useCartBump } from "@/components/motion/cartBump";
import { SPRING } from "@/components/motion/presets";
import { CartIcon } from "@/components/ui/icons";

// 메뉴판 머리 — "호떡" 글자가 반죽처럼 떨어져 눌리고(drop), "부스" 딱지가 척 붙고(stick), 제목 위로 열기가 일렁인다.
// 스크롤하면 제목이 천천히 밀려나며 흐려지고, 머리를 지나면 위에 작은 바가 내려온다. 위쪽 진행 막대가 스크롤만큼 찬다.
export function MenuHero({ cartCount }: { cartCount: number }) {
    const { scrollY, scrollYProgress } = useScroll();
    const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
    const titleY = useTransform(scrollY, [0, 260], [0, 60]);
    const titleOpacity = useTransform(scrollY, [0, 220], [1, 0.15]);
    const [compact, setCompact] = useState(false);
    const [dropKey, setDropKey] = useState(0);
    useMotionValueEvent(scrollY, "change", (y) => setCompact(y > 240));

    return (
        <>
            <motion.div aria-hidden="true" style={{ scaleX: progress }} className="fixed inset-x-0 top-0 z-40 h-[3px] origin-left bg-linear-to-r from-caramel via-syrup to-[#ffe2a6]" />

            <header className="relative px-5 pt-5 pb-6">
                <div className="flex items-center justify-between">
                    <p className="font-num flex items-center gap-2 text-xs text-dough-dim">
                        <span className="pulse-dot size-2 rounded-full bg-syrup" />
                        2026 평택대학교 대동제
                    </p>
                    <CartButton count={cartCount} />
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
                    <h1 className="relative flex items-end gap-3">
                        {/* 글자를 누르면 다시 반죽처럼 떨어진다(장식 놀이) */}
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
                            <span className="jelly syrup-text inline-block origin-bottom" style={{ animationDelay: "0.05s, 2.2s" }}>
                                호
                            </span>
                            <span className="jelly syrup-text inline-block origin-bottom" style={{ animationDelay: "0.18s, 2.45s" }}>
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
                            className="font-display anim-stick mb-3 inline-block -rotate-6 rounded-xl bg-dough px-3 py-1 text-2xl text-molasses shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
                            style={{ animationDelay: "0.75s" }}
                        >
                            부스
                        </span>
                    </h1>
                    <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.9, type: "spring", stiffness: 300, damping: 26 }}
                        className="mt-3 text-sm text-dough-dim"
                    >
                        바삭하게 구워낸 따끈한 호떡
                    </motion.p>
                </motion.div>
            </header>

            {/* 머리를 지나면 내려오는 작은 바 — 제목은 h1이 이미 있으므로 문단으로 둔다 */}
            <AnimatePresence>
                {compact && (
                    <motion.div initial={{ y: -72 }} animate={{ y: 0 }} exit={{ y: -72 }} transition={SPRING} className="fixed inset-x-0 top-0 z-30">
                        <div className="mx-auto flex max-w-md items-center gap-3 border-b border-iron-line bg-iron/85 px-5 py-2.5 backdrop-blur-xl">
                            <p className="font-display syrup-text flex-1 text-xl">호떡 부스</p>
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
    return (
        <motion.div animate={bump} whileTap={{ scale: 0.9 }}>
            <Link
                href="/cart"
                aria-label={`장바구니 ${count}개`}
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
