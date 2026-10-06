// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { cleanup, render, screen } from "@testing-library/react";
import AdminProtectedLayout from "@/app/admin/(protected)/layout";
import AdminDashboardPage from "@/app/admin/(protected)/page";
import { makePreviewOrders } from "@/features/admin/DashboardPreview";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    redirect: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock("@/infra/supabase/session", () => ({
    createSessionClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

// Realtime 구독 연결만 대신한다. 주문 목록은 아래 fetch 스텁이 돌려준다.
vi.mock("@/infra/supabase/browser", () => ({
    createAdminBrowserClient: () => {
        const channel = { on: () => channel, subscribe: () => channel };
        return { channel: () => channel, removeChannel: vi.fn(), auth: { signOut: vi.fn() } };
    },
}));

function stubFetch(result: () => Promise<Response>) {
    const request = vi.fn((url: string) => url.startsWith("/api/admin/staff-calls")
        ? Promise.resolve(new Response(JSON.stringify({ calls: [], unacknowledgedCount: 0 }), { status: 200 }))
        : result());
    vi.stubGlobal("fetch", request);
    return request;
}

function ordersResponse(orders: ReturnType<typeof makePreviewOrders>) {
    return new Response(JSON.stringify({ orders }), { status: 200 });
}

async function renderAdminPage() {
    mockGetUser.mockResolvedValueOnce({
        data: { user: { id: "admin-1", email: "admin@ptu.ac.kr" } },
        error: null,
    });
    const jsx = await AdminProtectedLayout({ children: <AdminDashboardPage /> });
    return render(jsx!);
}

function logoutButtons() {
    return screen.getAllByRole("button", { name: "로그아웃" });
}

describe("/admin 대시보드 페이지", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("오늘 주문을 받아 실시간 대시보드에 보여 주고 미확인 주문을 강조한다", async () => {
        const request = stubFetch(async () => ordersResponse(makePreviewOrders()));

        await renderAdminPage();

        expect(await screen.findByRole("button", { name: "픽업 001 주문 상세" })).toBeTruthy();
        expect(screen.getByRole("heading", { name: "호떡 운영 대시보드" })).toBeTruthy();
        expect(screen.getAllByText("● 새 주문 · 미확인")).toHaveLength(2);
        expect(screen.getByRole("status").textContent).toBe("미확인 주문 2건");
        expect(request).toHaveBeenCalledWith("/api/admin/orders");
    });

    it("주문이 0건이면 '아직 주문이 없습니다.'를 보여 준다", async () => {
        stubFetch(async () => ordersResponse([]));

        await renderAdminPage();

        expect(await screen.findByText("아직 주문이 없습니다.")).toBeTruthy();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("주문 목록 응답을 기다리는 동안 로딩 문구를 보여 준다", async () => {
        stubFetch(() => new Promise<Response>(() => {}));

        await renderAdminPage();

        expect(await screen.findByText("주문을 불러오는 중입니다…")).toBeTruthy();
        expect(screen.queryByText("아직 주문이 없습니다.")).toBeNull();
    });

    it("주문 조회가 500으로 실패하면 오류를 알리고 로그아웃 버튼은 남는다", async () => {
        stubFetch(async () => new Response(null, { status: 500 }));

        await renderAdminPage();

        expect((await screen.findByRole("alert")).textContent).toBe("주문을 불러오지 못했습니다. 새로고침해 주세요.");
        expect(logoutButtons()).toHaveLength(1);
    });

    it("네트워크 오류로 조회가 끊겨도 오류를 알리고 로그아웃 버튼은 남는다", async () => {
        stubFetch(async () => { throw new TypeError("Failed to fetch"); });

        await renderAdminPage();

        expect((await screen.findByRole("alert")).textContent).toBe("주문을 불러오지 못했습니다. 새로고침해 주세요.");
        expect(logoutButtons()).toHaveLength(1);
    });

    it("레이아웃 헤더와 대시보드가 겹치지 않는다 — 로그아웃 1개·숨김 없음, main 1개, 부스 이름 1번", async () => {
        stubFetch(async () => ordersResponse(makePreviewOrders()));

        const { container } = await renderAdminPage();

        expect(await screen.findByRole("navigation", { name: "관리자 메뉴" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "교대 스케줄" }).getAttribute("href")).toBe("/admin/shifts");
        const [logout] = logoutButtons();
        expect(logoutButtons()).toHaveLength(1);
        for (let node: HTMLElement | null = logout; node; node = node.parentElement) {
            const hidingClass = [...node.classList].find(name => /(^|:)hidden$/.test(name));
            expect(hidingClass).toBeUndefined();
        }
        expect(container.querySelectorAll("main")).toHaveLength(1);
        expect(screen.getAllByText("평택대 부스 관리자")).toHaveLength(1);
        expect(screen.queryByText("호떡 부스")).toBeNull();
    });
});
