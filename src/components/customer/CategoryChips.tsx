"use client";

import { motion } from "motion/react";
import type { MENU_CATEGORIES, MenuCategoryId } from "@/features/customer/menuCategories";
import { ArtIcon } from "@/components/ui/ArtIcon";
import { useT } from "@/lib/i18n/locale";

// 맛 탭. 고른 탭 아래로 시럽색 막대가 미끄러져 옮겨 간다(layoutId) — 탭 사이 관계가 눈으로 이어진다.
export function CategoryChips({
    categories,
    value,
    onChange,
}: {
    categories: typeof MENU_CATEGORIES;
    value: MenuCategoryId;
    onChange: (id: MenuCategoryId) => void;
}) {
    const t = useT();
    if (categories.length <= 1) return null;
    return (
        <div role="group" aria-label={t("category.groupLabel")} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-iron-line px-4">
            {categories.map((category) => {
                const active = category.id === value;
                return (
                    <button
                        key={category.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(category.id)}
                        className={`relative flex shrink-0 items-center gap-1.5 px-3 pt-1 pb-3 text-[15px] font-bold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-syrup ${
                            active ? "text-syrup" : "text-dough-dim hover:text-dough"
                        }`}
                    >
                        {/* 고른 칩의 아이콘은 톡 튀어나와 흔들린다(key로 다시 그림) */}
                        <motion.span
                            key={active ? "on" : "off"}
                            initial={active ? { scale: 0.3, rotate: -40, y: 6 } : false}
                            animate={{ scale: active ? 1.15 : 1, rotate: 0, y: 0 }}
                            transition={{ type: "spring", stiffness: 520, damping: 13 }}
                            className={`flex ${active ? "" : "opacity-70 grayscale-[35%]"}`}
                        >
                            <ArtIcon name={category.icon} size={22} motion={active ? "wiggle" : "none"} className="drop-shadow-none" />
                        </motion.span>
                        {t(`category.${category.id}` as const)}
                        {active && (
                            <motion.span
                                layoutId="menu-category-bar"
                                transition={{ type: "spring", stiffness: 500, damping: 34 }}
                                aria-hidden="true"
                                className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-syrup shadow-[0_0_12px_rgba(255,181,71,0.8)]"
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
