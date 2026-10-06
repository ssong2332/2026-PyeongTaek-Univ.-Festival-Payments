"use client";

import { motion } from "motion/react";

// 고객 화면 사이를 오갈 때 새 화면이 부드럽게 떠오른다(template는 이동할 때마다 새로 그려진다).
// 위치·크기 변환(transform·filter)은 쓰지 않는다 — 안쪽의 고정 머리(sticky)·하단 바(fixed)·시트의 기준이 바뀌기 때문. 투명도만 바꾼다.
export default function CustomerTemplate({ children }: { children: React.ReactNode }) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: "easeOut" }}>
            {children}
        </motion.div>
    );
}
