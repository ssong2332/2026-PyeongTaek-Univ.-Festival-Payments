// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConnectionMonitor } from "@/features/admin/useConnectionMonitor";

describe("T-23 useConnectionMonitor", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("정상 상태(채널 SUBSCRIBED, 헬스체크 성공)에서는 isDisconnected=false를 유지한다", async () => {
        const checkHealth = vi.fn().mockResolvedValue(true);
        const onRecover = vi.fn();

        const { result } = renderHook(() =>
            useConnectionMonitor({
                channelStatus: "SUBSCRIBED",
                checkHealth,
                onRecover,
            }),
        );

        // 초기 헬스체크 실행
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.isDisconnected).toBe(false);
        expect(result.current.isChannelOk).toBe(true);
        expect(result.current.isHealthOk).toBe(true);
        expect(onRecover).not.toHaveBeenCalled();
    });

    it("5초 미만의 일시적 끊김은 isDisconnected=false를 유지하고 배너를 띄우지 않는다 (F-31)", async () => {
        const checkHealth = vi.fn().mockResolvedValue(false); // 헬스 실패
        const onRecover = vi.fn();

        const { result, rerender } = renderHook(
            ({ channelStatus }) =>
                useConnectionMonitor({
                    channelStatus,
                    disconnectThresholdMs: 10000,
                    checkHealth,
                    onRecover,
                }),
            { initialProps: { channelStatus: "SUBSCRIBED" } },
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        // 4초 경과 (10초 미만, 5초 미만 일시 장애)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });
        expect(result.current.isDisconnected).toBe(false);

        // 4.5초 시점에 정상 복구
        checkHealth.mockResolvedValue(true);
        rerender({ channelStatus: "SUBSCRIBED" });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });

        // 여전히 false 유지
        expect(result.current.isDisconnected).toBe(false);
        expect(onRecover).not.toHaveBeenCalled();
    });

    it("장애가 10초 연속 지속되면 isDisconnected=true가 된다", async () => {
        const checkHealth = vi.fn().mockResolvedValue(true);
        const onRecover = vi.fn();

        const { result, rerender } = renderHook(
            ({ channelStatus }) =>
                useConnectionMonitor({
                    channelStatus,
                    disconnectThresholdMs: 10000,
                    checkHealth,
                    onRecover,
                }),
            { initialProps: { channelStatus: "SUBSCRIBED" } },
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.isDisconnected).toBe(false);

        // 채널 상태가 TIMED_OUT으로 전환 (비정상 시작)
        rerender({ channelStatus: "TIMED_OUT" });

        // 9초 경과 - 아직 10초 미만
        await act(async () => {
            await vi.advanceTimersByTimeAsync(9000);
        });
        expect(result.current.isDisconnected).toBe(false);

        // 10초 도달 (1초 추가)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(result.current.isDisconnected).toBe(true);
    });

    it("10초 지속으로 끊김 확정 후 정상 복구 시 배너가 사라지고 onRecover(재동기화)가 1회 호출된다", async () => {
        let isHealthy = false;
        const checkHealth = vi.fn().mockImplementation(async () => isHealthy);
        const onRecover = vi.fn().mockResolvedValue(undefined);

        const { result, rerender } = renderHook(
            ({ channelStatus }) =>
                useConnectionMonitor({
                    channelStatus,
                    disconnectThresholdMs: 10000,
                    healthCheckIntervalMs: 5000,
                    checkHealth,
                    onRecover,
                }),
            { initialProps: { channelStatus: "SUBSCRIBED" } },
        );

        // 헬스체크 실패로 시작
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        // 10초 경과로 끊김 확정
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(result.current.isDisconnected).toBe(true);
        expect(onRecover).not.toHaveBeenCalled();

        // 이제 복구 (헬스 정상화 및 채널 SUBSCRIBED)
        isHealthy = true;
        rerender({ channelStatus: "SUBSCRIBED" });

        // 다음 헬스체크 주기 (5초) 후 복구 감지
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });

        expect(result.current.isDisconnected).toBe(false);
        expect(onRecover).toHaveBeenCalledTimes(1);
    });

    it("수동 재확인(checkNow) 호출 시 정상 복구되면 즉시 isDisconnected=false 및 onRecover가 실행된다", async () => {
        let isHealthy = false;
        const checkHealth = vi.fn().mockImplementation(async () => isHealthy);
        const onRecover = vi.fn();

        const { result } = renderHook(() =>
            useConnectionMonitor({
                channelStatus: "SUBSCRIBED",
                disconnectThresholdMs: 10000,
                checkHealth,
                onRecover,
            }),
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(result.current.isDisconnected).toBe(true);

        // 복구 상태 준비
        isHealthy = true;

        // 사용자가 배너의 '다시 확인' 클릭
        await act(async () => {
            const ok = await result.current.checkNow();
            expect(ok).toBe(true);
        });

        expect(result.current.isDisconnected).toBe(false);
        expect(onRecover).toHaveBeenCalledTimes(1);
    });
});
