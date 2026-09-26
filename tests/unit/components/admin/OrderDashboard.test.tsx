// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import { DashboardPreview, makePreviewOrders } from "@/features/admin/DashboardPreview";

afterEach(cleanup);
const base = () => ({ orders: makePreviewOrders(), onReload: vi.fn(async () => {}),
    onAcknowledge: vi.fn(async () => {}), onSearch: vi.fn(async () => []),
    onTransition: vi.fn(async () => {}) });

describe("T-15 order dashboard", () => {
    it("acknowledges without changing payment status, removing the unread count", async () => {
        render(<DashboardPreview />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
        fireEvent.click(screen.getByRole("button", { name: "확인 처리" }));
        await waitFor(() => expect(screen.getByText("확인한 주문입니다.")).toBeTruthy());
        expect(screen.getAllByText("결제대기").length).toBeGreaterThan(0);
        expect(screen.getByText("미확인 주문 1건")).toBeTruthy();
    });
    it("keeps unread state on failure and reports the error", async () => {
        const props = base(); props.onAcknowledge.mockRejectedValue(new Error("500"));
        render(<OrderDashboard {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
        fireEvent.click(screen.getByRole("button", { name: "확인 처리" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("확인 처리에 실패"));
        expect(screen.getByRole("button", { name: "확인 처리" })).toBeTruthy();
        expect(screen.queryByText("픽업 #001 주문을 확인했습니다.")).toBeNull();
    });
    it("searches locally and falls back to the server for an older pickup number", async () => {
        const props = base(); render(<OrderDashboard {...props} />);
        fireEvent.change(screen.getByLabelText("픽업 번호"), { target: { value: "002" } });
        fireEvent.click(screen.getByRole("button", { name: "검색" }));
        expect(props.onSearch).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "픽업 001 주문 상세" })).toBeNull();
        fireEvent.change(screen.getByLabelText("픽업 번호"), { target: { value: "999" } });
        fireEvent.click(screen.getByRole("button", { name: "검색" }));
        await waitFor(() => expect(props.onSearch).toHaveBeenCalledWith(999));
        await waitFor(() => expect(screen.getByText("해당 픽업 번호의 주문이 없습니다.")).toBeTruthy());
    });
    it("does not let a stale search replace the reset list", async () => {
        let finish!: (orders: ReturnType<typeof makePreviewOrders>) => void;
        render(<OrderDashboard {...base()} onSearch={() => new Promise(resolve => { finish = resolve; })} />);
        fireEvent.change(screen.getByLabelText("픽업 번호"), { target: { value: "999" } });
        fireEvent.click(screen.getByRole("button", { name: "검색" }));
        fireEvent.click(screen.getByRole("button", { name: "초기화" }));
        finish([]);
        await waitFor(() => expect(screen.getByRole("button", { name: "픽업 001 주문 상세" })).toBeTruthy());
        expect(screen.queryByText("해당 픽업 번호의 주문이 없습니다.")).toBeNull();
    });
    it("renders loading and empty states separately", () => {
        const props = base(); const { rerender } = render(<OrderDashboard {...props} orders={[]} isLoading />);
        expect(screen.getByText("주문을 불러오는 중입니다…")).toBeTruthy();
        expect(screen.queryByText("아직 주문이 없습니다.")).toBeNull();
        rerender(<OrderDashboard {...props} orders={[]} />);
        expect(screen.getByText("아직 주문이 없습니다.")).toBeTruthy();
    });
    it("rejects invalid pickup numbers without requesting data", () => {
        const props = base(); render(<OrderDashboard {...props} />);
        fireEvent.change(screen.getByLabelText("픽업 번호"), { target: { value: "-1" } });
        fireEvent.click(screen.getByRole("button", { name: "검색" }));
        expect(screen.getByRole("alert").textContent).toContain("1 이상의 숫자");
        expect(props.onSearch).not.toHaveBeenCalled();
    });
});

describe("T-16 order actions", () => {
    it("shows only server-provided actions as enabled and does not treat acknowledgement as payment", () => {
        render(<OrderDashboard {...base()} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
        expect((screen.getByRole("button", { name: "현금 수령 확인" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "입금 확인" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "조리 시작" }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole("button", { name: "조리 완료" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("routes transfer payment confirmation and cooking completion to their matching actions", async () => {
        const props = base();
        render(<OrderDashboard {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 002 주문 상세" }));
        expect((screen.getByRole("button", { name: "입금 확인" }) as HTMLButtonElement).disabled).toBe(false);
        expect((screen.getByRole("button", { name: "현금 수령 확인" }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "입금 확인" }));
        await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith(props.orders[1].id, "confirm_payment"));

        fireEvent.click(screen.getByRole("button", { name: "픽업 003 주문 상세" }));
        expect((screen.getByRole("button", { name: "조리 완료" }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "조리 완료" }));
        await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith(props.orders[2].id, "complete"));

        fireEvent.click(screen.getByRole("button", { name: "픽업 004 주문 상세" }));
        expect(screen.getAllByRole("button", { name: /입금 확인|현금 수령 확인|조리 시작|조리 완료/ })
            .every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    });

    it("enables cooking start only when the order advertises that action", async () => {
        const props = base();
        const paid = { ...props.orders[1], status: "paid" as const, availableActions: ["start_cooking" as const] };
        props.orders = [paid];
        render(<OrderDashboard {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 002 주문 상세" }));
        expect((screen.getByRole("button", { name: "조리 시작" }) as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "조리 시작" }));
        await waitFor(() => expect(props.onTransition).toHaveBeenCalledWith(paid.id, "start_cooking"));
    });

    it("keeps the old status until the transition succeeds and blocks duplicate clicks", async () => {
        let finish!: () => void;
        const props = base();
        props.onTransition.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        render(<OrderDashboard {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
        fireEvent.click(screen.getByRole("button", { name: "현금 수령 확인" }));
        expect(props.onTransition).toHaveBeenCalledExactlyOnceWith(props.orders[0].id, "confirm_cash");
        expect((screen.getByRole("button", { name: "처리 중…" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getAllByText("결제대기").length).toBeGreaterThan(0);
        finish();
        await waitFor(() => expect(screen.getByText("픽업 #001 주문 상태를 변경했습니다.")).toBeTruthy());
    });

    it("reports failure without changing the order", async () => {
        const props = base(); props.onTransition.mockRejectedValue(new Error("409"));
        render(<OrderDashboard {...props} />);
        fireEvent.click(screen.getByRole("button", { name: "픽업 001 주문 상세" }));
        fireEvent.click(screen.getByRole("button", { name: "현금 수령 확인" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("상태 변경에 실패"));
        expect(screen.getAllByText("결제대기").length).toBeGreaterThan(0);
        expect(screen.queryByText("픽업 #001 주문 상태를 변경했습니다.")).toBeNull();
    });
});
