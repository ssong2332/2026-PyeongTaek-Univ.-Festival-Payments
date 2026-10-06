"use client";

import { useEffect, useRef } from "react";

const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_TIMEOUT_MS = 8_000;

/** 관리자 대시보드가 열려 있는 동안 만료 스윕을 실행한다. */
export function useSweepHeartbeat(onChanged: () => void): void {
    const onChangedRef = useRef(onChanged);
    useEffect(() => {
        onChangedRef.current = onChanged;
    }, [onChanged]);

    useEffect(() => {
        let active = true;
        let inFlight = false;
        let currentController: AbortController | null = null;

        async function sweep() {
            if (inFlight) return;
            inFlight = true;
            const controller = new AbortController();
            currentController = controller;
            const timeout = window.setTimeout(() => controller.abort(), SWEEP_TIMEOUT_MS);
            try {
                const response = await fetch("/api/admin/sweep", {
                    method: "POST",
                    signal: controller.signal,
                });
                if (!response.ok) return;
                const result: { expired?: number; completed?: number } = await response.json();
                if (active && ((result.expired ?? 0) > 0 || (result.completed ?? 0) > 0)) {
                    onChangedRef.current();
                }
            } catch {
                // 네트워크 오류와 타임아웃은 다음 틱에서 재시도한다.
            } finally {
                window.clearTimeout(timeout);
                currentController = null;
                inFlight = false;
            }
        }

        const interval = window.setInterval(sweep, SWEEP_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(interval);
            currentController?.abort();
        };
    }, []);
}
