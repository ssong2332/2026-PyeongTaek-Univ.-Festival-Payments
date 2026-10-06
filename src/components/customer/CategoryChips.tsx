"use client";

import { motion } from "motion/react";
import type { MENU_CATEGORIES, MenuCategoryId } from "@/features/customer/menuCategories";
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
                        className={`relative shrink-0 px-3 pt-1 pb-3 text-[15px] font-bold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-syrup ${
                            active ? "text-syrup" : "text-dough-dim hover:text-dough"
                        }`}
                    >
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
