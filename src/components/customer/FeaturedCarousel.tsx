"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { ChevronRightIcon, FlameIcon, PlusIcon } from "@/components/ui/icons";
import { menuImageUrl } from "@/features/customer/menuImages";
import type { MenuItemDto } from "@/lib/dto/menu";
import { formatWon } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/locale";
import { MenuThumbnail } from "./MenuThumbnail";
import { ArtIcon } from "@/components/ui/ArtIcon";

// "오늘의 추천" 큰 사진 카드 띠(가로로 밀어 보기). 아래 전체 메뉴의 바로가기라 화면 읽기·키보드는 목록 쪽을 쓰고
// 여기는 숨긴다(aria-hidden, 탭 이동 제외). 손가락으로 밀면 가운데 카드가 앞으로 나오고 양옆은 비스듬히 물러나며
// (스크롤 연동 CSS — 지원하는 브라우저에서), 사진은 카드보다 느리게 흘러 깊이감을 준다. 카드를 기울이면 빛이 따라온다.
export function FeaturedCarousel({ items, onSelect }: { items: readonly MenuItemDto[]; onSelect: (menuId: string) => void }) {
    const t = useT();
    if (items.length === 0) return null;
    return (
        <section aria-hidden="true" className="-mx-4">
            <div className="flex items-end justify-between px-4 pb-2">
                <p className="font-display flex items-center gap-1.5 text-xl text-dough">
                    <ArtIcon name="fire" size={26} motion="wiggle" />
                    {t("menu.featured.title")}
                </p>
                <p className="fest-hint">
                    {t("menu.featured.swipe")}
                    <ChevronRightIcon className="fest-hint-arrow size-3.5" strokeWidth={3} />
                </p>
            </div>
            <div className="feat-track flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-1 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((item) => (
                    <FeaturedCard key={item.id} item={item} onSelect={() => onSelect(item.id)} />
                ))}
                {/* 마지막 카드도 가운데까지 밀 수 있게 여백 */}
                <span className="w-[14%] shrink-0" />
            </div>
        </section>
    );
}

function FeaturedCard({ item, onSelect }: { item: MenuItemDto; onSelect: () => void }) {
    const locale = useLocale();
    const t = useT();
    // 손가락·마우스 위치 → 카드 기울기(스프링) + 빛 위치
    const px = useMotionValue(0.5);
    const py = useMotionValue(0.5);
    const rotateY = useSpring(useTransform(px, [0, 1], [-10, 10]), { stiffness: 220, damping: 18 });
    const rotateX = useSpring(useTransform(py, [0, 1], [8, -8]), { stiffness: 220, damping: 18 });
    const glare = useTransform([px, py], ([x, y]: number[]) => `radial-gradient(220px circle at ${x * 100}% ${y * 100}%, rgba(255,226,166,0.35), transparent 60%)`);
    const track = (event: PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        px.set((event.clientX - rect.left) / rect.width);
        py.set((event.clientY - rect.top) / rect.height);
    };
    const reset = () => {
        px.set(0.5);
        py.set(0.5);
    };
    return (
        <div className="feat-card w-[64%] shrink-0 snap-center [perspective:900px]">
            <motion.button
                type="button"
                tabIndex={-1}
                onClick={onSelect}
                onPointerMove={track}
                onPointerLeave={reset}
                onPointerCancel={reset}
                style={{ rotateX, rotateY }}
                whileTap={{ scale: 0.96 }}
                className="glow-border relative block aspect-[4/5] w-full overflow-hidden rounded-[28px] text-left shadow-[0_18px_40px_rgba(20,8,4,0.45)] [transform-style:preserve-3d]"
            >
                <span className="feat-img absolute -inset-x-[14%] inset-y-0">
                    <MenuThumbnail imageUrl={menuImageUrl(item.id, item.imageUrl)} className="size-full" />
                </span>
                <span className="absolute inset-0 bg-linear-to-t from-[#140a07] via-[#140a07]/40 to-transparent" />
                {/* 위로 피어오르는 불티 */}
                {[0, 1, 2, 3, 4].map((index) => (
                    <span
                        key={index}
                        className="ember-flicker absolute bottom-0 size-1 rounded-full bg-[#ffd27a] shadow-[0_0_8px_2px_rgba(255,170,60,0.85)]"
                        style={
                            {
                                left: `${14 + index * 18}%`,
                                animationDuration: `${3.2 + (index % 3) * 0.9}s, ${0.7 + index * 0.15}s`,
                                animationDelay: `${-index * 0.8}s, 0s`,
                                "--drift": `${(index % 2 ? 1 : -1) * 14}px`,
                            } as React.CSSProperties
                        }
                    />
                ))}
                <motion.span className="pointer-events-none absolute inset-0 mix-blend-screen" style={{ backgroundImage: glare }} />
                <span className="sheen pointer-events-none absolute inset-0" />
                <span className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-[#140a07]/70 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#ffd27a] backdrop-blur">
                    <FlameIcon className="size-3.5" />
                    {t("menu.featured.title")}
                </span>
                <span className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-4" style={{ transform: "translateZ(30px)" }}>
                    <span className="min-w-0 flex-1">
                        <span className="font-display line-clamp-2 text-[22px] leading-tight text-[#fff3e0] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">{item.name}</span>
                        {item.description && <span className="mt-0.5 block truncate text-xs text-[#ead6c0]/85">{item.description}</span>}
                        <span className="font-num mt-1 block text-lg text-[#ffb547]">{formatWon(item.price, locale)}</span>
                    </span>
                    <span className="syrup-btn flex size-10 shrink-0 items-center justify-center rounded-full">
                        <PlusIcon className="size-5" />
                    </span>
                </span>
            </motion.button>
        </div>
    );
}
