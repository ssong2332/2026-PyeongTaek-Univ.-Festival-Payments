"use client";

import { MotionConfig } from "motion/react";
import { TapSparkles } from "./TapSparkles";

// 고객 화면 전체 모션 설정 — 기기의 "동작 줄이기"가 켜져 있으면 이동·크기 애니메이션을 끄고 투명도만 남긴다.
export function CustomerMotion({ children }: { children: React.ReactNode }) {
    return (
        <MotionConfig reducedMotion="user">
            <TapSparkles />
            {children}
        </MotionConfig>
    );
}
