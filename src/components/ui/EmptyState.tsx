"use client";

import { motion } from "motion/react";
import type { CustomerIconName } from "@/features/customer/customerIcons";
import { ArtIcon } from "./ArtIcon";

// 빈 상태: 불씨가 남은 빈 철판 위에 상황 아이콘(Flaticon)이 둥실 떠 있다.
// 점선 불씨 고리가 천천히 돌고, 작은 불티 세 개가 철판 둘레를 공전한다(동작 줄이기면 멈춤).
export function EmptyState({ title, children, icon = "hotteok" }: { title: string; children?: React.ReactNode; icon?: CustomerIconName }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="flex flex-col items-center gap-4 px-4 py-10 text-center"
        >
            <span
                aria-hidden="true"
                className="relative flex size-36 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_40%,#3a3140,#15121a_70%)] shadow-[0_0_0_2px_rgba(185,88,28,0.35),0_0_44px_rgba(240,120,40,0.22),inset_0_8px_20px_rgba(0,0,0,0.6)]"
            >
                <span className="absolute inset-2.5 rounded-full border-2 border-dashed border-syrup/30 motion-safe:animate-[spin_18s_linear_infinite]" />
                {[0, 1, 2].map((index) => (
                    <span
                        key={index}
                        className="absolute inset-0 motion-safe:animate-[spin_6s_linear_infinite]"
                        style={{ animationDelay: `${index * -2}s` }}
                    >
                        <span className="absolute top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[#ffd27a] shadow-[0_0_10px_3px_rgba(255,180,70,0.8)]" />
                    </span>
                ))}
                <span className="absolute inset-x-8 bottom-6 h-3 rounded-[50%] bg-black/45 blur-md" />
                <motion.span
                    initial={{ scale: 0.3, rotate: -30, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 360, damping: 14, delay: 0.12 }}
                >
                    <ArtIcon name={icon} size={76} motion="float" />
                </motion.span>
            </span>
            <p className="font-display text-xl text-dough">{title}</p>
            {children}
        </motion.div>
    );
}
