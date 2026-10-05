"use client";

import { DEMO_MODE, installDemoFetch } from "./demoMode";

// 모듈을 불러오는 순간(첫 렌더·첫 fetch보다 먼저) 데모 fetch를 건다 — 자식의 useEffect가 부모보다 먼저 돌기 때문.
if (typeof window !== "undefined") installDemoFetch();

// 데모 데이터로 돌고 있음을 화면에 분명히 표시한다(개발 모드 + DB 미연결일 때만).
export function DemoBadge() {
    if (!DEMO_MODE) return null;
    return (
        <p className="pointer-events-none fixed top-2 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-syrup/50 bg-iron/90 px-3 py-1 text-[11px] font-bold text-syrup backdrop-blur">
            데모 데이터 · DB 미연결
        </p>
    );
}
