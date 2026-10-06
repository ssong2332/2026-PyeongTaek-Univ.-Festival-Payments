"use client";

import { motion } from "motion/react";
import { HotteokMascot, type MascotVariant } from "./HotteokMascot";

// 빈 상태: 불씨가 남은 빈 철판 위에 호떡이(mascot)가 올라 상황을 알려 준다.
// 철판 테두리를 따라 점선 불씨 고리가 천천히 돌고, 호떡이는 살짝 통통 뛴다(동작 줄이기면 멈춤).
export function EmptyState({ title, children, mascot = "icon" }: { title: string; children?: React.ReactNode; mascot?: MascotVariant }) {
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
                <span className="absolute inset-x-6 bottom-5 h-3 rounded-[50%] bg-black/45 blur-md" />
                <motion.span
                    initial={{ scale: 0.4, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.12 }}
                >
                    <HotteokMascot variant={mascot} size={92} motion="bob" />
                </motion.span>
            </span>
            <p className="font-display text-xl text-dough">{title}</p>
            {children}
        </motion.div>
    );
}
