"use client";

import { motion } from "motion/react";
import { HotteokMascot, type MascotVariant } from "./HotteokMascot";

// 빈 상태: 불이 약하게 남은 빈 철판. 화면이 너무 비어 보일 때만 호떡이(mascot)를 작게 올린다.
export function EmptyState({ title, children, mascot }: { title: string; children?: React.ReactNode; mascot?: MascotVariant }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="flex flex-col items-center gap-4 px-4 py-10 text-center"
        >
            <span
                aria-hidden="true"
                className="relative flex size-32 items-center justify-center rounded-full bg-[radial-gradient(circle_at_50%_40%,#3a3140,#15121a_70%)] shadow-[0_0_0_2px_rgba(185,88,28,0.35),0_0_40px_rgba(240,120,40,0.18),inset_0_8px_20px_rgba(0,0,0,0.6)]"
            >
                <span className="absolute inset-3 rounded-full border border-caramel/25" />
                {mascot && <HotteokMascot variant={mascot} size={60} motion="breathe" />}
            </span>
            <p className="font-display text-xl text-dough">{title}</p>
            {children}
        </motion.div>
    );
}
