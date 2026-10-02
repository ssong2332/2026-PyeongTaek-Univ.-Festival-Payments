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

type PendingRequest = { url: string; respond: (body: unknown) => Promise<void> };
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
                        respond: (body) =>
                            act(async () => {
                                resolve({ ok: true, status: 200, json: async () => body } as Response);
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

describe("useOrdersFeed — 응답 순서가 뒤바뀌어도 최신 상태 유지", () => {
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
});
