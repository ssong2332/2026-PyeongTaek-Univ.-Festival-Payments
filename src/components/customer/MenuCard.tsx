"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { PlusIcon } from "@/components/ui/icons";
import { formatWon } from "@/lib/format";
import { MenuThumbnail } from "./MenuThumbnail";

export interface MenuCardProps {
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    soldOut: boolean;
    recommended?: boolean;
    onSelect: () => void;
    // 상세 시트의 사진과 같은 값을 주면, 누른 카드의 사진이 시트 사진 자리로 이어져 커진다(shared element).
    layoutId?: string;
}

// 가로형 철판 카드. 누르면 카드 전체가 살짝 눌리고 호떡 사진이 누르개에 눌린 듯 납작해졌다가 탄성 있게 돌아온다.
export function MenuCard({ name, description, price, imageUrl, soldOut, recommended = false, onSelect, layoutId }: MenuCardProps) {
    // 스크롤하면 둥근 호떡 사진이 철판 위에서 돌듯 천천히 회전한다.
    const { scrollY } = useScroll();
    const spin = useTransform(scrollY, (y) => (soldOut ? 0 : y * 0.12));

    // 손가락·마우스 자리를 따라 카드 위에 스포트라이트를 비춘다(globals.css .spotlight).
    function trackPointer(event: React.PointerEvent<HTMLButtonElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }

    return (
        <motion.button
            type="button"
            whileTap={soldOut ? undefined : "pressed"}
            whileHover={soldOut ? undefined : "hover"}
            onClick={onSelect}
            disabled={soldOut}
            variants={{ pressed: { scale: 0.975 } }}
            transition={{ type: "spring", stiffness: 500, damping: 18 }}
            onPointerMove={trackPointer}
            onPointerDown={trackPointer}
            className="iron-card spotlight group relative grid w-full grid-cols-[96px_1fr] items-center gap-3.5 rounded-3xl py-3 pr-4 pl-3 text-left disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
        >
            <motion.span
                layoutId={layoutId}
                variants={{
                    pressed: { scaleY: 0.82, scaleX: 1.1, transition: { type: "spring", stiffness: 700, damping: 15 } },
                    hover: { rotate: 8, scale: 1.04 },
                }}
                className={`relative block size-24 overflow-hidden rounded-full shadow-[0_12px_24px_rgba(0,0,0,0.5),0_0_0_3px_rgba(255,181,71,0.08)] ${soldOut ? "grayscale" : ""}`}
            >
                <motion.span style={{ rotate: spin }} className="block size-full">
                    <MenuThumbnail imageUrl={imageUrl} className="size-full" />
                </motion.span>
                {soldOut && (
                    <span className="absolute inset-0 flex items-center justify-center bg-iron/60">
                        <span className="rounded-md border border-dough/60 px-2 py-0.5 text-xs font-bold tracking-widest text-dough">품절</span>
                    </span>
                )}
            </motion.span>
            <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                    <span className="font-display min-w-0 truncate text-[19px] leading-tight text-dough">{name}</span>
                    {recommended && <span className="shrink-0 rounded-full bg-syrup/20 px-2 py-0.5 text-[11px] font-bold text-syrup">오늘의 추천</span>}
                </span>
                {description && <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-dough-dim">{description}</span>}
                <span className="mt-2 flex items-center justify-between">
                    <span className={`font-num text-lg ${soldOut ? "text-dough-dim" : "text-syrup"}`}>{formatWon(price)}</span>
                    {!soldOut && (
                        <motion.span
                            aria-hidden="true"
                            variants={{ hover: { rotate: 90 }, pressed: { rotate: 90, scale: 0.85 } }}
                            className="flex size-9 items-center justify-center rounded-full bg-syrup text-molasses shadow-[0_6px_16px_rgba(255,181,71,0.35)]"
                        >
                            <PlusIcon className="size-5" strokeWidth={2.75} />
                        </motion.span>
                    )}
                </span>
            </span>
        </motion.button>
    );
}
