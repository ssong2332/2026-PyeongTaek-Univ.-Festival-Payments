"use client";

import { AnimatePresence, motion } from "motion/react";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";

// 검색창(유리 알약): 뒤 하늘·불빛이 흐리게 비친다. 누르면 테두리에 시럽빛이 돌고 돋보기가 살짝 기울어진다. 글자를 넣으면 지우기 버튼이 굴러 들어온다.
export function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="group fest-glass flex h-13 items-center gap-2.5 rounded-full px-5 transition-[box-shadow,border-color] duration-300 focus-within:border-syrup/70 focus-within:shadow-[0_0_0_4px_rgba(255,181,71,0.12),0_0_24px_rgba(255,181,71,0.15)]">
            <SearchIcon className="size-[18px] text-dough-dim transition-all duration-300 group-focus-within:-rotate-12 group-focus-within:text-syrup" />
            <label htmlFor="menu-search" className="sr-only">
                메뉴 검색
            </label>
            <input
                id="menu-search"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="메뉴 이름으로 찾기"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-dough outline-none placeholder:text-dough-dim/70 [&::-webkit-search-cancel-button]:hidden"
            />
            <AnimatePresence>
                {value !== "" && (
                    <motion.button
                        type="button"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                        onClick={() => onChange("")}
                        aria-label="검색어 지우기"
                        className="flex size-7 items-center justify-center rounded-full bg-iron-line text-dough focus-visible:outline-2 focus-visible:outline-syrup"
                    >
                        <CloseIcon className="size-4" />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
