"use client";

import { motion } from "motion/react";
import type { MenuOptionGroupDto } from "@/lib/dto/menu";
import { formatOptionPrice } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/locale";

// hint: 그룹의 min/max 안내 문구(예: "원하는 것만 선택", "필수 · 1개 선택") — 화면(훅)이 만들어 넘긴다.
export type OptionGroupView = MenuOptionGroupDto & { hint: string };

export interface OptionSelectorProps {
    groups: readonly OptionGroupView[];
    selectedIds: readonly string[];
    onToggle: (groupId: string, optionId: string) => void;
}

// 옵션 행. 고르면 체크가 선으로 그려지고, 행의 가격표가 아래 "담을 구성" 칸으로 날아가 붙는다(같은 layoutId).
// 빼면 가격표가 다시 행으로 돌아온다. 빠르게 여러 개를 눌러도 각 가격표가 자기 자리로만 움직여 겹치지 않는다.
export function OptionSelector({ groups, selectedIds, onToggle }: OptionSelectorProps) {
    const locale = useLocale();
    const t = useT();
    if (groups.length === 0) return null;
    return (
        <div className="flex flex-col gap-5">
            {groups.map((group) => {
                // 필수 단일 선택 그룹은 라디오(하나만), 나머지는 체크박스(maxSelect까지).
                const single = group.minSelect === 1 && group.maxSelect === 1;
                const countInGroup = group.options.filter((option) => selectedIds.includes(option.id)).length;
                const labelId = `option-group-${group.id}`;
                const hintId = `option-group-hint-${group.id}`;
                return (
                    <div key={group.id} role="group" aria-labelledby={labelId} aria-describedby={hintId}>
                        <div className="mb-2.5 flex items-baseline justify-between gap-2">
                            <span id={labelId} className="font-display text-lg text-dough">
                                {group.name}
                            </span>
                            <span id={hintId} className="text-xs text-dough-dim">
                                {group.hint}
                            </span>
                        </div>
                        {group.options.length === 0 && <p className="text-sm text-dough-dim">{t("option.noneAvailable")}</p>}
                        <div className="flex flex-col gap-2">
                            {group.options.map((option) => {
                                const checked = selectedIds.includes(option.id);
                                const disabled = !single && !checked && countInGroup >= group.maxSelect;
                                return (
                                    <label
                                        key={option.id}
                                        className={`flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-[border-color,background-color] duration-300 active:scale-[0.99] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-syrup ${
                                            checked ? "border-syrup/60 bg-syrup/10" : "border-iron-line bg-iron/50"
                                        } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
                                    >
                                        <input
                                            type={single ? "radio" : "checkbox"}
                                            name={group.id}
                                            checked={checked}
                                            disabled={disabled}
                                            onChange={() => onToggle(group.id, option.id)}
                                            className="sr-only"
                                        />
                                        <CheckMark checked={checked} round={single} />
                                        <span className={`flex-1 text-[15px] font-medium transition-colors ${checked ? "text-dough" : "text-dough/85"}`}>{option.name}</span>
                                        {/* 고르지 않았을 때만 행에 있는 가격표 — 고르면 담을 구성 칸으로 날아간다 */}
                                        <span className="flex h-7 min-w-14 justify-end">
                                            {!checked && (
                                                <motion.span
                                                    layoutId={`option-tag-${option.id}`}
                                                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                                                    className="font-num rounded-full border border-iron-line px-2.5 py-1 text-xs text-dough-dim"
                                                >
                                                    {formatOptionPrice(option.extraPrice, locale)}
                                                </motion.span>
                                            )}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// 체크박스는 체크 선이 그려지고, 라디오는 가운데 점이 톡 찬다.
function CheckMark({ checked, round }: { checked: boolean; round: boolean }) {
    return (
        <span
            aria-hidden="true"
            className={`relative flex size-6 shrink-0 items-center justify-center border-2 transition-colors duration-200 ${round ? "rounded-full" : "rounded-lg"} ${
                checked ? "border-syrup bg-syrup" : "border-dough-dim/60"
            }`}
        >
            {/* 고르는 순간 체크 자리에서 작은 불꽃이 퍼진다 */}
            {checked &&
                Array.from({ length: 6 }, (_, index) => {
                    const angle = (index / 6) * Math.PI * 2;
                    return (
                        <motion.span
                            key={index}
                            className="absolute size-1 rounded-full bg-syrup"
                            initial={{ x: 0, y: 0, opacity: 1 }}
                            animate={{ x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, opacity: 0 }}
                            transition={{ duration: 0.45, ease: "easeOut" }}
                        />
                    );
                })}
            {round ? (
                <motion.span
                    initial={false}
                    animate={{ scale: checked ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 20 }}
                    className="size-2.5 rounded-full bg-molasses"
                />
            ) : (
                <svg viewBox="0 0 24 24" className="size-4">
                    <motion.path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        fill="none"
                        stroke="#3b1a08"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={false}
                        animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                    />
                </svg>
            )}
        </span>
    );
}
