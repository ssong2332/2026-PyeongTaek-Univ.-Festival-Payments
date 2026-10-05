"use client";

import { motion } from "motion/react";

// 고객 화면 사이를 오갈 때마다(템플릿은 이동마다 새로 마운트된다) 부드럽게 나타난다.
// transform·filter를 쓰면 안쪽 position: fixed(하단 바·시트)의 기준이 바뀌므로 투명도만 움직인다.
export default function CustomerTemplate({ children }: { children: React.ReactNode }) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}>
            {children}
        </motion.div>
    );
}
