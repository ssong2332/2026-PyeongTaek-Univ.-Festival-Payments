// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrdersFeed } from "@/features/admin/useOrdersFeed";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

// ADR-0003: 응답이 늦게·역순으로 도착해도 화면은 updatedAt이 가장 새로운 주문을 보여야 한다.
// 응답 순서를 테스트가 정하려고 fetch는 요청마다 멈춰 두고, Realtime은 등록된 콜백을 잡아 직접 이벤트를 보낸다.

type RealtimeHandler = (payload: { eventType: "INSERT" | "UPDATE"; new: Record<string, unknown> }) => void;
const realtime = vi.hoisted(() => ({ handler: null as RealtimeHandler | null }));
vi.mock("@/infra/supabase/browser", () => ({
    createAdminBrowserClient: () => {
        const channel = {
            on: (_type: string, _filter: unknown, handler: RealtimeHandler) => {
                realtime.handler = handler;
                return channel;
            },
            subscribe: () => channel,
        };
        return { channel: () => channel, removeChannel: () => {} };
    },
}));

type PendingRequest = { url: string; respond: (body: unknown, status?: number) => Promise<void> };
let requests: PendingRequest[] = [];

beforeEach(() => {
    requests = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(
            (url: string) =>
                new Promise<Response>((resolve) => {
                    requests.push({
                        url,
                        // 응답을 보내고 훅이 본문을 읽어 상태에 반영할 때까지 기다린다.
                        respond: (body, status = 200) =>
                            act(async () => {
                                resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
                                await new Promise((done) => setTimeout(done, 0));
                            }),
                    });
                }),
        ),
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    realtime.handler = null;
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T0 = "2026-10-07T03:00:00.000Z";
const T1 = "2026-10-07T03:01:00.000Z";
const T2 = "2026-10-07T03:02:00.000Z";

function order(id: string, status: AdminOrderDto["status"], updatedAt: string): AdminOrderDto {
    return {
        id,
        pickupNumber: 101,
        status,
        paymentMethod: "cash",
        totalAmount: 3000,
        items: [],
        createdAt: T0,
        updatedAt,
        acknowledgedAt: null,
        transferReportedAt: null,
        cancelRequestedAt: null,
        cancelRejectedAt: null,
        paidAt: null,
        cookingStartedAt: status === "cooking" ? updatedAt : null,
        completedAt: null,
        closedAt: null,
        refundChannel: null,
        lastReason: null,
        availableActions: [],
    };
}

function emit(eventType: "INSERT" | "UPDATE", row: Record<string, unknown>) {
    act(() => realtime.handler?.({ eventType, new: row }));
}

function pendingTo(url: string) {
    return requests.filter((request) => request.url === url);
}

function statusOf(orders: AdminOrderDto[]) {
    return Object.fromEntries(orders.map((item) => [item.id, item.status]));
}

const kitchenOrders = Array.from({ length: 201 }, (_, index) => ({
    ...order(`00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, "cooking", T0),
    pickupNumber: index + 1,
}));

describe("useOrdersFeed — 응답 순서가 뒤바뀌어도 최신 상태 유지", () => {
    it("최초 목록·Realtime 취소 요청/거절·새로고침에서 조리 진입 액션을 일치시킨다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        const requested = {
            ...order(A, "pending", T1), paymentMethod: "transfer" as const,
            cancelRequestedAt: T1, availableActions: ["cancel" as const],
        };
        await pendingTo("/api/admin/orders")[0].respond({ orders: [requested] });
        expect(result.current.orders[0].availableActions).toEqual(["cancel"]);

        emit("UPDATE", { id: A, cancel_rejected_at: T2, updated_at: T2 });
        expect(result.current.orders[0].availableActions).toEqual(["confirm_payment", "cancel"]);

        emit("UPDATE", { id: A, cancel_requested_at: "2026-10-07T03:03:00.000Z",
            cancel_rejected_at: null, updated_at: "2026-10-07T03:03:00.000Z" });
        expect(result.current.orders[0].availableActions).toEqual(["cancel"]);

        let refreshing!: Promise<void>;
        act(() => { refreshing = result.current.refresh(); });
        await pendingTo("/api/admin/orders")[1].respond({ orders: [{
            ...requested, updatedAt: "2026-10-07T03:04:00.000Z",
            cancelRequestedAt: T1, cancelRejectedAt: T2,
            availableActions: ["confirm_payment", "cancel"],
        }] });
        await act(async () => { await refreshing; });
        expect(result.current.orders[0].availableActions).toEqual(["confirm_payment", "cancel"]);
    });

    it("상세 조회 응답이 역순으로 와도(최신 cooking 뒤에 오래된 pending) cooking을 유지한다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        await pendingTo("/api/admin/orders")[0].respond({ orders: [] });

        // 새 주문 INSERT → 상세 조회 1. 상세 조회가 끝나기 전에 UPDATE(조리 시작)가 와서 상세 조회 2.
        emit("INSERT", { id: A });
        emit("UPDATE", { id: A, status: "cooking", updated_at: T1 });
        const [first, second] = pendingTo(`/api/admin/orders/${A}`);
        expect(second).toBeDefined();

        await second.respond(order(A, "cooking", T1));
        await first.respond(order(A, "pending", T0));

        expect(statusOf(result.current.orders)).toEqual({ [A]: "cooking" });
    });

    it("초기 목록이 늦게 와도 그사이 실시간으로 받은 최신 상태와 새 주문을 덮어쓰지 않는다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        const list = pendingTo("/api/admin/orders")[0];

        // 목록 응답 전에 실시간으로 A(조리 시작)와 새 주문 B를 받는다.
        emit("INSERT", { id: A });
        emit("INSERT", { id: B });
        await pendingTo(`/api/admin/orders/${A}`)[0].respond(order(A, "cooking", T1));
        await pendingTo(`/api/admin/orders/${B}`)[0].respond(order(B, "pending", T1));

        // 늦게 도착한 목록: A는 예전 값, B는 아직 없음(목록을 만든 뒤 생긴 주문), C는 목록에만 있음.
        await list.respond({ orders: [order(A, "pending", T0), order(C, "paid", T0)] });

        expect(statusOf(result.current.orders)).toEqual({ [A]: "cooking", [B]: "pending", [C]: "paid" });
        expect(result.current.isLoading).toBe(false);
    });

    it("새로고침 중 실시간으로 받은 최신 상태를 늦게 온 새로고침 목록이 되돌리지 않는다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        await pendingTo("/api/admin/orders")[0].respond({ orders: [order(A, "pending", T0)] });

        let reloading!: Promise<void>;
        act(() => {
            reloading = result.current.reload();
        });
        // 새로고침 요청을 보낸 뒤 조리 시작(T1)·조리 완료(T2)가 실시간으로 온다.
        emit("UPDATE", { id: A, status: "cooking", updated_at: T1 });
        emit("UPDATE", { id: A, status: "completed", updated_at: T2 });
        await pendingTo("/api/admin/orders")[1].respond({ orders: [order(A, "cooking", T1)] });
        await act(async () => {
            await reloading;
        });

        expect(statusOf(result.current.orders)).toEqual({ [A]: "completed" });
    });

    it("새로고침 목록이 더 새로우면 목록 값으로 바꾸고, 목록에서 빠진 주문(실시간 변경 없음)은 뺀다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        await pendingTo("/api/admin/orders")[0].respond({ orders: [order(A, "pending", T0), order(B, "pending", T0)] });

        let reloading!: Promise<void>;
        act(() => {
            reloading = result.current.reload();
        });
        await pendingTo("/api/admin/orders")[1].respond({ orders: [order(A, "paid", T1)] });
        await act(async () => {
            await reloading;
        });

        expect(statusOf(result.current.orders)).toEqual({ [A]: "paid" });
    });

    it("연결 끊김 중 대체 조회가 지연돼도 기존 주문판과 요약은 로딩 상태로 돌아가지 않는다", async () => {
        const { result } = renderHook(() => useOrdersFeed());
        await pendingTo("/api/admin/orders")[0].respond({ orders: [order(A, "pending", T0)] });

        let refreshing!: Promise<void>;
        act(() => { refreshing = result.current.refresh(); });
        expect(result.current.isLoading).toBe(false);
        expect(statusOf(result.current.orders)).toEqual({ [A]: "pending" });

        await pendingTo("/api/admin/orders")[1].respond({ orders: [order(A, "paid", T1)] });
        await act(async () => { await refreshing; });
        expect(result.current.isLoading).toBe(false);
        expect(statusOf(result.current.orders)).toEqual({ [A]: "paid" });
    });
});

describe("useOrdersFeed — 조리 화면 범위", () => {
    it("scope=kitchen이면 날짜 대신 조리 화면 범위로 목록을 부르고, 전체 건수를 알려 준다", async () => {
        const { result } = renderHook(() => useOrdersFeed({ scope: "kitchen", limit: 200, initialDate: "2026-10-07" }));
        expect(requests.map((request) => request.url)).toEqual(["/api/admin/orders?scope=kitchen&limit=200"]);
        await requests[0].respond({ orders: [], total: 201 });
        expect(result.current.total).toBe(201);
    });

    it("200건을 받은 뒤 limit 400으로 정상 전환하면 201건을 모두 유지한다", async () => {
        const { result, rerender } = renderHook(({ limit }) => useOrdersFeed({ scope: "kitchen", limit }), { initialProps: { limit: 200 } });
        await requests[0].respond({ orders: kitchenOrders.slice(0, 200), total: 201 });
        rerender({ limit: 400 });
        const expanded = pendingTo("/api/admin/orders?scope=kitchen&limit=400")[0];
        expect(expanded).toBeDefined();
        await expanded.respond({ orders: kitchenOrders, total: 201 });
        expect(result.current.orders).toHaveLength(201);
        expect(result.current.total).toBe(201);
        expect(result.current.isLoading).toBe(false);
    });

    it("늦게 온 200건 자동 조회가 400건 응답의 201번째 주문과 total을 지우지 못한다", async () => {
        const { result, rerender } = renderHook(({ limit }) => useOrdersFeed({ scope: "kitchen", limit }), { initialProps: { limit: 200 } });
        await requests[0].respond({ orders: kitchenOrders.slice(0, 200), total: 201 });
        let oldRefresh!: Promise<void>;
        act(() => { oldRefresh = result.current.refresh(); });
        const oldRequest = pendingTo("/api/admin/orders?scope=kitchen&limit=200")[1];
        rerender({ limit: 400 });
        await pendingTo("/api/admin/orders?scope=kitchen&limit=400")[0]
            .respond({ orders: kitchenOrders, total: 201 });
        expect(result.current.orders).toHaveLength(201);

        await oldRequest.respond({ orders: kitchenOrders.slice(0, 200), total: 202 });
        await act(async () => { await oldRefresh; });
        expect(result.current.orders).toHaveLength(201);
        expect(result.current.orders.some((item) => item.id === kitchenOrders[200].id)).toBe(true);
        expect(result.current.total).toBe(201);
        expect(result.current.isLoading).toBe(false);
    });

    it("같은 limit의 연속 조회와 reload가 역순으로 끝나도 마지막 요청만 적용한다", async () => {
        const { result } = renderHook(() => useOrdersFeed({ scope: "kitchen", limit: 200 }));
        await requests[0].respond({ orders: [order(A, "cooking", T0)], total: 1 });
        let oldRefresh!: Promise<void>;
        let reloading!: Promise<void>;
        act(() => {
            oldRefresh = result.current.refresh();
            reloading = result.current.reload();
        });
        const [, stale, latest] = pendingTo("/api/admin/orders?scope=kitchen&limit=200");
        await latest.respond({ orders: [order(B, "cooking", T1)], total: 2 });
        await act(async () => { await reloading; });
        await stale.respond({ orders: [order(A, "cooking", T0)], total: 1 });
        await act(async () => { await oldRefresh; });
        expect(result.current.orders.map((item) => item.id)).toEqual([B]);
        expect(result.current.total).toBe(2);
        expect(result.current.isLoading).toBe(false);
    });

    it("같은 limit의 연속 refresh에서 늦은 첫 응답이나 실패가 최신 결과를 덮지 않는다", async () => {
        const { result } = renderHook(() => useOrdersFeed({ scope: "kitchen", limit: 200 }));
        await requests[0].respond({ orders: [order(A, "cooking", T0)], total: 1 });
        let first!: Promise<void>;
        let second!: Promise<void>;
        act(() => {
            first = result.current.refresh();
            second = result.current.refresh();
        });
        const [, stale, latest] = pendingTo("/api/admin/orders?scope=kitchen&limit=200");
        await latest.respond({ orders: [order(B, "cooking", T1)], total: 2 });
        await act(async () => { await second; });
        await stale.respond(null, 503);
        await act(async () => { await first; });
        expect(result.current.orders.map((item) => item.id)).toEqual([B]);
        expect(result.current.total).toBe(2);
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it("초기 목록보다 뒤에 시작한 refresh가 먼저 끝나면 초기 응답을 무시한다", async () => {
        const { result } = renderHook(() => useOrdersFeed({ scope: "kitchen", limit: 200 }));
        let refreshing!: Promise<void>;
        act(() => { refreshing = result.current.refresh(); });
        const [initial, newer] = pendingTo("/api/admin/orders?scope=kitchen&limit=200");
        await newer.respond({ orders: [order(B, "cooking", T1)], total: 2 });
        await act(async () => { await refreshing; });
        await initial.respond({ orders: [order(A, "cooking", T0)], total: 1 });
        expect(result.current.orders.map((item) => item.id)).toEqual([B]);
        expect(result.current.total).toBe(2);
        expect(result.current.isLoading).toBe(false);
    });

    it("실패한 현재 조회는 기존 주문을 남기고 오류를 표시하며, 재조회 성공 시 복구한다", async () => {
        const { result } = renderHook(() => useOrdersFeed({ scope: "kitchen", limit: 200 }));
        await requests[0].respond({ orders: [order(A, "cooking", T0)], total: 1 });
        let failing!: Promise<void>;
        act(() => { failing = result.current.refresh(); });
        await requests[1].respond(null, 503);
        await act(async () => { await failing; });
        expect(result.current.orders.map((item) => item.id)).toEqual([A]);
        expect(result.current.error).toContain("503");

        let recovering!: Promise<void>;
        act(() => { recovering = result.current.reload(); });
        await requests[2].respond({ orders: [order(B, "cooking", T1)], total: 1 });
        await act(async () => { await recovering; });
        expect(result.current.orders.map((item) => item.id)).toEqual([B]);
        expect(result.current.total).toBe(1);
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });
});
