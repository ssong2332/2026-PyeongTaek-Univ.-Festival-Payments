// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUEUE_REFRESH_MS, useMenu } from "@/features/customer/useMenu";
import type { MenuResponse } from "@/lib/dto/menu";

const menuResponse: MenuResponse = {
    items: [{
        id: "11111111-1111-1111-1111-111111111111",
        name: "기본호떡",
        description: "기본호떡",
        price: 2000,
        stock: 5,
        isRecommended: false,
        isAvailable: true,
        isSoldOut: false,
        imageUrl: null,
        optionGroups: [],
    }],
    waitingCount: 3,
    locale: "ko",
};

const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function routeFetch(handlers: { menu?: () => Promise<Response>; queue?: () => Promise<Response> }) {
    fetchMock.mockImplementation((url) => {
        if (url.startsWith("/api/menu")) return handlers.menu?.() ?? Promise.resolve(json(200, menuResponse));
        if (url.startsWith("/api/queue")) return handlers.queue?.() ?? Promise.resolve(json(200, { waitingCount: 0 }));
        return Promise.reject(new Error(`unexpected ${url}`));
    });
}

const calls = (prefix: string) => fetchMock.mock.calls.filter(([url]) => url.startsWith(prefix)).length;

beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function flush() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

describe("useMenu", () => {
    it("마운트 시 GET /api/menu?lang=ko → loading 후 ready, 메뉴·대기 수를 돌려준다", async () => {
        routeFetch({});
        const { result } = renderHook(() => useMenu());
        expect(result.current.status).toBe("loading");
        await flush();
        expect(fetchMock.mock.calls[0][0]).toBe("/api/menu?lang=ko");
        expect(result.current.status).toBe("ready");
        expect(result.current.items.map((item) => item.name)).toEqual(["기본호떡"]);
        expect(result.current.waitingCount).toBe(3);
    });

    it("서버 오류면 error, reload 후 성공하면 ready", async () => {
        let fail = true;
        routeFetch({ menu: async () => (fail ? json(500, { error: { code: "INTERNAL_ERROR", message: "x" } }) : json(200, menuResponse)) });
        const { result } = renderHook(() => useMenu());
        await flush();
        expect(result.current.status).toBe("error");

        fail = false;
        act(() => result.current.reload());
        expect(result.current.status).toBe("loading");
        await flush();
        expect(result.current.status).toBe("ready");
        expect(result.current.items).toHaveLength(1);
    });

    it("응답이 계약(MenuResponseSchema)과 다르면 error", async () => {
        routeFetch({ menu: async () => json(200, { items: [{ id: "x" }] }) });
        const { result } = renderHook(() => useMenu());
        await flush();
        expect(result.current.status).toBe("error");
    });

    it("네트워크 오류면 error", async () => {
        routeFetch({ menu: () => Promise.reject(new TypeError("fetch failed")) });
        const { result } = renderHook(() => useMenu());
        await flush();
        expect(result.current.status).toBe("error");
    });

    it("대기 수는 30초마다 GET /api/queue로 갱신한다 (경계: 29.999초에는 아직 요청 없음)", async () => {
        routeFetch({ queue: async () => json(200, { waitingCount: 7 }) });
        const { result } = renderHook(() => useMenu());
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS - 1);
        });
        expect(calls("/api/queue")).toBe(0);
        expect(result.current.waitingCount).toBe(3);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(calls("/api/queue")).toBe(1);
        expect(result.current.waitingCount).toBe(7);
    });

    it("대기 수 갱신이 실패하면 이전 값을 유지하고 메뉴 상태는 바꾸지 않는다", async () => {
        routeFetch({ queue: async () => json(503, { error: { code: "INTERNAL_ERROR", message: "x" } }) });
        const { result } = renderHook(() => useMenu());
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS);
        });
        expect(calls("/api/queue")).toBe(1);
        expect(result.current.waitingCount).toBe(3);
        expect(result.current.status).toBe("ready");
    });

    it("pollQueue: false면 대기 수를 갱신하지 않는다(장바구니 재검사용)", async () => {
        routeFetch({});
        renderHook(() => useMenu("ko", { pollQueue: false }));
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 2);
        });
        expect(calls("/api/queue")).toBe(0);
    });

    it("언마운트하면 갱신을 멈춘다", async () => {
        routeFetch({});
        const { unmount } = renderHook(() => useMenu());
        await flush();
        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 3);
        });
        expect(calls("/api/queue")).toBe(0);
    });
});
