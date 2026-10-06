"use client";

import { motion } from "motion/react";
import { ArtIcon } from "@/components/ui/ArtIcon";
import { PlusIcon } from "@/components/ui/icons";
import { flavorBadges } from "@/features/customer/menuCategories";
import { formatWon } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/locale";
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
// 사진 둘레에는 점선 불빛 고리가 천천히 돌고 김이 오르며, 화면에 처음 들어올 때 카드 위로 윤기가 한 번 쓱 지나간다.
// 이름·설명에서 맛(꿀·치즈·시즈닝·매콤)을 읽어 작은 그림 배지로 보이고, 담기 버튼은 둘레가 숨 쉬듯 퍼진다.
export function MenuCard({ name, description, price, imageUrl, soldOut, recommended = false, onSelect, layoutId }: MenuCardProps) {
    const locale = useLocale();
    const t = useT();
    const flavors = flavorBadges(`${name} ${description ?? ""}`);
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
            className="iron-card spotlight group relative grid w-full grid-cols-[104px_1fr] items-center gap-3.5 overflow-hidden rounded-3xl py-3.5 pr-4 pl-3 text-left disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-syrup"
        >
            {/* 처음 화면에 들어올 때 한 번 지나가는 윤기 */}
            {!soldOut && (
                <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-[#fff3d6]/14 to-transparent"
                    initial={{ x: "0%" }}
                    whileInView={{ x: "420%" }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 1.1, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
                />
            )}

            <span className="relative flex size-[104px] items-center justify-center">
                {/* 사진 둘레 점선 불빛 고리 + 오르는 김(장식) */}
                {!soldOut && (
                    <>
                        <span aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-dashed border-syrup/40 motion-safe:animate-[spin_16s_linear_infinite]" />
                        <span aria-hidden="true" className="pointer-events-none absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 gap-3">
                            {[0, 1].map((index) => (
                                <span key={index} className="h-7 w-2 rounded-full bg-white/30 blur-[5px] motion-safe:animate-steam" style={{ animationDelay: `${index * -1.3}s` }} />
                            ))}
                        </span>
                    </>
                )}
                <motion.span
                    layoutId={layoutId}
                    variants={{
                        pressed: { scaleY: 0.82, scaleX: 1.1, transition: { type: "spring", stiffness: 700, damping: 15 } },
                        hover: { scale: 1.05 },
                    }}
                    className={`relative block size-[88px] overflow-hidden rounded-full shadow-[0_12px_24px_rgba(0,0,0,0.5),0_0_0_3px_rgba(255,181,71,0.12),0_0_22px_rgba(255,160,60,0.18)] ${soldOut ? "grayscale" : ""}`}
                >
                    {/* 메뉴 사진은 똑바로 둔다(돌리면 사진이 기울어 보인다) */}
                    <MenuThumbnail imageUrl={imageUrl} className="size-full" />
                    {soldOut && (
                        <span className="absolute inset-0 flex items-center justify-center bg-iron/60">
                            <span className="rounded-md border border-dough/60 px-2 py-0.5 text-xs font-bold tracking-widest text-dough">{t("menu.soldOut")}</span>
                        </span>
                    )}
                </motion.span>
            </span>

            <span className="relative flex min-w-0 flex-col">
                <span className="flex items-start gap-2">
                    <span className="font-display line-clamp-2 min-w-0 text-[19px] leading-tight text-dough">{name}</span>
                    {recommended && <span className="shrink-0 rounded-full bg-syrup/20 px-2 py-0.5 text-[11px] font-bold text-syrup">{t("menu.recommended")}</span>}
                </span>
                {description && <span className="mt-1 line-clamp-2 text-[13px] leading-snug text-dough-dim">{description}</span>}
                {flavors.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                        {flavors.map((flavor) => (
                            <span key={flavor.id} className="flex items-center gap-1 rounded-full bg-iron/70 py-0.5 pr-2 pl-1 text-[11px] font-bold text-dough/85 ring-1 ring-iron-line">
                                <ArtIcon name={flavor.icon} size={15} className="drop-shadow-none" />
                                {t(`category.${flavor.id}` as const)}
                            </span>
                        ))}
                    </span>
                )}
                <span className="mt-2 flex items-center justify-between">
                    <span className={`font-num text-lg ${soldOut ? "text-dough-dim" : "text-syrup drop-shadow-[0_0_10px_rgba(255,181,71,0.35)]"}`}>{formatWon(price, locale)}</span>
                    {!soldOut && (
                        <span aria-hidden="true" className="relative flex size-10 items-center justify-center">
                            <span className="absolute inset-0 rounded-full border-2 border-syrup/60 motion-safe:animate-ping-soft" />
                            <motion.span
                                variants={{ hover: { rotate: 90, scale: 1.08 }, pressed: { rotate: 180, scale: 0.8 } }}
                                className="syrup-btn relative flex size-10 items-center justify-center rounded-full"
                            >
                                <PlusIcon className="size-5" strokeWidth={2.75} />
                            </motion.span>
                        </span>
                    )}
                </span>
            </span>
        </motion.button>
    );
}
