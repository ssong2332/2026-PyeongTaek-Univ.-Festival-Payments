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

it("30초마다 스윕하고 전환이 생기면 주문 목록을 다시 읽는다", async () => {
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

it("응답이 지연되면 중복 요청을 보내지 않는다", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", request);
    renderHook(() => useSweepHeartbeat(vi.fn()));

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => { finish(new Response(JSON.stringify({ expired: 0, completed: 0 }))); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(request).toHaveBeenCalledTimes(2);
});
