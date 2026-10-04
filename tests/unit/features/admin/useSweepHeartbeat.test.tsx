// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSweepHeartbeat } from "@/features/admin/useSweepHeartbeat";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it("30초마다 스윕하고 주문 전환이 생기면 목록을 다시 읽는다", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ expired: 1, completed: 0 })));
    const reload = vi.fn();
    vi.stubGlobal("fetch", request);
    const { unmount } = renderHook(() => useSweepHeartbeat(reload));

    expect(request).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledWith("/api/admin/sweep", {
        method: "POST",
        signal: expect.any(AbortSignal),
    });
    expect(reload).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(1);
});

it("변경이 없으면 목록을 다시 읽지 않고, 지연된 요청을 중복 전송하지 않는다", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    const reload = vi.fn();
    vi.stubGlobal("fetch", request);
    renderHook(() => useSweepHeartbeat(reload));

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { finish(new Response(JSON.stringify({ expired: 0, completed: 0 }))); });
    expect(reload).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(2);
});

it("본문 수신이 멈추면 타임아웃으로 중단하고 다음 틱에 재시도한다", async () => {
    const signals: AbortSignal[] = [];
    const request = vi.fn((_url: string, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        return new Promise<Response>((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
    });
    vi.stubGlobal("fetch", request);
    renderHook(() => useSweepHeartbeat(vi.fn()));

    await act(async () => { await vi.advanceTimersByTimeAsync(38_000); });
    expect(signals[0].aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(22_000); });
    expect(request).toHaveBeenCalledTimes(2);
});
