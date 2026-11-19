"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { isLiteDevice } from "@/lib/deviceTier";
import { TapSparkles } from "./TapSparkles";

// 고객 화면 전체 모션 설정 — 기기의 "동작 줄이기"가 켜져 있으면 이동·크기 애니메이션을 끄고 투명도만 남긴다.
// 보급형 기기는 <html data-lite>를 달아 globals.css에서 흐림·연기·반복 장식을 끈다.
export function CustomerMotion({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        if (!isLiteDevice()) return;
        document.documentElement.dataset.lite = "";
        return () => {
            delete document.documentElement.dataset.lite;
        };
    }, []);
    return (
        <MotionConfig reducedMotion="user">
            <TapSparkles />
            {children}
        </MotionConfig>
    );
}
