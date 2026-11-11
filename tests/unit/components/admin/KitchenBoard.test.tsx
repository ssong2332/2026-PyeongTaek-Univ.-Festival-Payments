// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KitchenBoard } from "@/components/admin/KitchenBoard";
import { selectCookingOrders } from "@/domain/order/kitchenQueue";
import { TransitionRequestError } from "@/features/admin/transitionError";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

const NOW = "2026-10-07T05:30:00.000Z";

function order(pickupNumber: number, patch: Partial<AdminOrderDto> = {}): AdminOrderDto {
    return {
        id: `00000000-0000-4000-8000-${String(pickupNumber).padStart(12, "0")}`,
        pickupNumber, status: "cooking", paymentMethod: "transfer", totalAmount: 2000,
        items: [{ menuNameKo: "기본 호떡", quantity: 2, options: [{ nameKo: "시나몬 추가", extraPrice: 0 }], lineTotal: 2000 }],
        createdAt: NOW, updatedAt: NOW, acknowledgedAt: NOW, transferReportedAt: null,
        cancelRequestedAt: null, cancelRejectedAt: null, paidAt: NOW, cookingStartedAt: NOW,
        completedAt: null, closedAt: null, refundChannel: null, lastReason: null, availableActions: ["complete", "refund"],
        ...patch,
    };
}

function renderBoard(orders: AdminOrderDto[], onComplete = vi.fn(async () => {})) {
    render(<KitchenBoard orders={orders} isLoading={false} error={null} initialNow={NOW} onReload={async () => {}} onComplete={onComplete} />);
    return onComplete;
}

afterEach(cleanup);

it("keeps only cooking orders, oldest first, with pickup number as the tie-break", () => {
    const sorted = selectCookingOrders([
        order(3, { cookingStartedAt: "2026-10-07T05:20:00.000Z" }),
        order(1, { status: "paid" }),
        order(5, { cookingStartedAt: "2026-10-07T05:10:00.000Z" }),
        order(2, { cookingStartedAt: "2026-10-07T05:10:00.000Z" }),
        order(4, { status: "completed" }),
    ]);
    expect(sorted.map((item) => item.pickupNumber)).toEqual([2, 5, 3]);
});

it("falls back to paid time when an order has no cooking start time", () => {
    const sorted = selectCookingOrders([
        order(1, { cookingStartedAt: "2026-10-07T05:20:00.000Z" }),
        order(2, { cookingStartedAt: null, paidAt: "2026-10-07T05:00:00.000Z" }),
    ]);
    expect(sorted.map((item) => item.pickupNumber)).toEqual([2, 1]);
});

it("shows number, menu, quantity, options and elapsed minutes", () => {
    renderBoard([order(7, { cookingStartedAt: "2026-10-07T05:18:30.000Z" })]);
    const card = within(screen.getByRole("list", { name: "조리중 주문" }));
    expect(card.getByText("#007")).toBeTruthy();
    expect(card.getByText("기본 호떡")).toBeTruthy();
    expect(card.getByText("×2")).toBeTruthy();
    expect(card.getByText("시나몬 추가")).toBeTruthy();
    expect(card.getByText("11분째")).toBeTruthy();
});

it("shows manual orders with their M number and flags an open cancel request", () => {
    renderBoard([order(2_100_000_001, { source: "manual", manualNumber: 4, cancelRequestedAt: NOW })]);
    expect(screen.getByText("M-004")).toBeTruthy();
    expect(screen.getByText(/취소 요청 있음/)).toBeTruthy();
});

it("completes the tapped order and ignores a second tap while it is in flight", async () => {
    let finish = () => {};
    const onComplete = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderBoard([order(7)], onComplete);
    const button = screen.getByRole("button", { name: "#007 조리 완료" }) as HTMLButtonElement;

    fireEvent.click(button);
    await waitFor(() => expect(button.disabled).toBe(true));
    fireEvent.click(button);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(order(7).id);
    finish();
    await waitFor(() => expect(button.disabled).toBe(false));
});

it("names the failed order and the reason when completing fails", async () => {
    renderBoard([order(7)], vi.fn(async () => { throw new TransitionRequestError("INVALID_TRANSITION"); }));
    fireEvent.click(screen.getByRole("button", { name: "#007 조리 완료" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("#007 완료 처리 실패");
    expect(alert.textContent).toContain("현재 주문 상태에서는");
});

it("says so when nothing is cooking and offers a retry on load errors", () => {
    const onReload = vi.fn(async () => {});
    const { rerender } = render(<KitchenBoard orders={[order(1, { status: "paid" })]} isLoading={false} error={null} initialNow={NOW} onReload={onReload} onComplete={vi.fn()} />);
    expect(screen.getByText("조리중인 주문이 없습니다.")).toBeTruthy();

    rerender(<KitchenBoard orders={[]} isLoading={false} error="boom" initialNow={NOW} onReload={onReload} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(onReload).toHaveBeenCalledTimes(1);
});
