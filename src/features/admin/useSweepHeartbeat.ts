"use client";

import { useEffect, useRef } from "react";

const SWEEP_INTERVAL_MS = 30_000;

/** 관리자 대시보드가 열려 있는 동안 DB 스윕을 주기적으로 실행한다. */
export function useSweepHeartbeat(onChanged: () => void): void {
    const onChangedRef = useRef(onChanged);
    useEffect(() => {
        onChangedRef.current = onChanged;
    }, [onChanged]);

    useEffect(() => {
        let inFlight = false;
        let active = true;
        const controller = new AbortController();

        async function sweep() {
            if (inFlight) return;
            inFlight = true;
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
                // 다음 틱에서 재시도한다. 네트워크 오류는 기존 피드 상태와 별개다.
            } finally {
                inFlight = false;
            }
        }

        const interval = window.setInterval(sweep, SWEEP_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(interval);
            controller.abort();
        };
    }, []);
}
