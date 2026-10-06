"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UseConnectionMonitorOptions {
    /** Supabase Realtime 채널 상태 (기본값: null/미지정 시 무시) */
    channelStatus?: string | null;
    /** 헬스체크 주기 (기본값: 5000ms, 5초) */
    healthCheckIntervalMs?: number;
    /** 끊김 상태로 전환할 지속 시간 (기본값: 10000ms, 10초 - F-31) */
    disconnectThresholdMs?: number;
    /** 헬스체크 엔드포인트 URL (기본값: /api/health) */
    healthUrl?: string;
    /** 헬스체크 함수 직접 주입 (단위 테스트 및 모킹용) */
    checkHealth?: () => Promise<boolean>;
    /** 연결 복구 시 호출할 콜백 (F-31: 복구 후 누락 주문 재조회) */
    onRecover?: () => Promise<void> | void;
    /** 연결 끊김(isDisconnected=true) 동안 실행할 폴백 폴링 콜백 (기본 5초 주기 - ADR-0003) */
    onDisconnectedTick?: () => Promise<void> | void;
    /** 폴백 폴링 주기 (기본값: 5000ms) */
    disconnectedPollingIntervalMs?: number;
    /** 훅 활성화 여부 (기본값: true) */
    enabled?: boolean;
}

export interface UseConnectionMonitorReturn {
    /** 10초 이상 끊김이 지속되어 배너를 표시해야 하는지 여부 (F-31) */
    isDisconnected: boolean;
    /** 수동 확인 또는 헬스체크 수행 중인지 여부 */
    isChecking: boolean;
    /** 수동 재확인 트리거 함수 */
    checkNow: () => Promise<boolean>;
    /** 최근 채널 구독 정상 여부 */
    isChannelOk: boolean;
    /** 최근 서버 헬스체크 정상 여부 */
    isHealthOk: boolean;
}

/**
 * ADR-0003, F-31, N-07: 관리자 대시보드 연결 상태 감시 훅
 * - (a) Realtime 채널 상태가 "SUBSCRIBED"가 아니거나
 * - (b) GET /api/health (5초 주기)가 실패할 때
 * - 위 둘 중 하나라도 10초 연속 지속되면 isDisconnected=true (배너 표시)
 * - 5초 미만 일시 끊김은 배너를 표시하지 않음
 * - 연결 복구 시 자동으로 배너 제거 및 onRecover() 콜백 실행
 */
export function useConnectionMonitor({
    channelStatus,
    healthCheckIntervalMs = 5000,
    disconnectThresholdMs = 10000,
    healthUrl = "/api/health",
    checkHealth,
    onRecover,
    onDisconnectedTick,
    disconnectedPollingIntervalMs = 5000,
    enabled = true,
}: UseConnectionMonitorOptions = {}): UseConnectionMonitorReturn {
    const [isDisconnected, setIsDisconnected] = useState<boolean>(false);
    const [isChecking, setIsChecking] = useState<boolean>(false);
    const [isHealthOk, setIsHealthOk] = useState<boolean>(true);

    const onRecoverRef = useRef(onRecover);
    useEffect(() => {
        onRecoverRef.current = onRecover;
    }, [onRecover]);

    const onDisconnectedTickRef = useRef(onDisconnectedTick);
    useEffect(() => {
        onDisconnectedTickRef.current = onDisconnectedTick;
    }, [onDisconnectedTick]);

    // 끊김 상태 동안 5초 폴링 폴백
    useEffect(() => {
        if (!isDisconnected) return;

        const interval = setInterval(() => {
            void onDisconnectedTickRef.current?.();
        }, disconnectedPollingIntervalMs);

        return () => {
            clearInterval(interval);
        };
    }, [isDisconnected, disconnectedPollingIntervalMs]);

    // 채널 상태 정상 여부 (channelStatus가 주어지면 "SUBSCRIBED"여야 정상)
    const isChannelOk = channelStatus === undefined || channelStatus === null || channelStatus === "SUBSCRIBED";

    // 기본 헬스체크 로직
    const performHealthCheck = useCallback(async (): Promise<boolean> => {
        if (checkHealth) {
            try {
                return await checkHealth();
            } catch {
                return false;
            }
        }
        try {
            const res = await fetch(healthUrl, { cache: "no-store", signal: AbortSignal.timeout(4000) });
            if (!res.ok) return false;
            const data = await res.json().catch(() => null);
            return Boolean(data && data.ok === true);
        } catch {
            return false;
        }
    }, [checkHealth, healthUrl]);

    // 끊김 시작 시각 기록용 ref
    const unhealthySinceRef = useRef<number | null>(null);
    const wasDisconnectedRef = useRef<boolean>(false);

    // 전체 상태 (채널과 헬스 둘 다 정상이어야 전체 정상)
    const isOverallHealthy = isChannelOk && isHealthOk;

    // 상태 변화에 따른 10초 지연 판정 및 복구 처리
    useEffect(() => {
        if (!enabled) {
            unhealthySinceRef.current = null;
            return;
        }

        if (isOverallHealthy) {
            // 정상이 된 경우
            unhealthySinceRef.current = null;
            if (wasDisconnectedRef.current) {
                // 이전이 끊김 상태였다면 복구 처리
                wasDisconnectedRef.current = false;
                setIsDisconnected(false);
                if (onRecoverRef.current) {
                    void onRecoverRef.current();
                }
            }
            return;
        }

        // 비정상인 경우
        const now = Date.now();
        if (unhealthySinceRef.current === null) {
            unhealthySinceRef.current = now;
        }

        const elapsed = now - unhealthySinceRef.current;
        const remaining = Math.max(0, disconnectThresholdMs - elapsed);

        if (remaining === 0) {
            wasDisconnectedRef.current = true;
            setIsDisconnected(true);
            return;
        }

        const timer = setTimeout(() => {
            wasDisconnectedRef.current = true;
            setIsDisconnected(true);
        }, remaining);

        return () => {
            clearTimeout(timer);
        };
    }, [isOverallHealthy, disconnectThresholdMs, enabled]);

    // 주기적 헬스체크 (5초 기본)
    useEffect(() => {
        if (!enabled) return;

        let isCancelled = false;
        let inFlight = false;

        const runCheck = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const ok = await performHealthCheck();
                if (!isCancelled) setIsHealthOk(ok);
            } finally {
                inFlight = false;
            }
        };

        // 초기 마운트 시 헬스체크 1회 실행
        void runCheck();

        const interval = setInterval(() => {
            void runCheck();
        }, healthCheckIntervalMs);

        return () => {
            isCancelled = true;
            clearInterval(interval);
        };
    }, [enabled, healthCheckIntervalMs, performHealthCheck]);

    // 수동 재확인 트리거 (다시 확인 버튼용)
    const checkNow = useCallback(async (): Promise<boolean> => {
        setIsChecking(true);
        try {
            const ok = await performHealthCheck();
            setIsHealthOk(ok);
            const overallOk = (channelStatus === undefined || channelStatus === null || channelStatus === "SUBSCRIBED") && ok;
            if (overallOk) {
                unhealthySinceRef.current = null;
                if (wasDisconnectedRef.current) {
                    wasDisconnectedRef.current = false;
                    setIsDisconnected(false);
                    if (onRecoverRef.current) {
                        await onRecoverRef.current();
                    }
                }
            }
            return overallOk;
        } finally {
            setIsChecking(false);
        }
    }, [performHealthCheck, channelStatus]);

    return {
        isDisconnected,
        isChecking,
        checkNow,
        isChannelOk,
        isHealthOk,
    };
}
