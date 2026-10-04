// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MenuItemDto } from "@/lib/dto/menu";
import { ManualOrderForm } from "@/features/admin/ManualOrderForm";
import { manualOrderShortages, manualOrderTotal, toManualOrderRequest } from "@/features/admin/manualOrder";

afterEach(cleanup);

const MENU_ID = "11111111-1111-1111-1111-111111111111";
const OPTION_ID = "22222222-2222-2222-2222-222222222222";
const KEY = "a19ac145-4e29-47c0-aadd-f53531211996";
const menu: MenuItemDto[] = [{
    id: MENU_ID, name: "호떡", description: null, price: 3000, stock: 1,
    isAvailable: true, isSoldOut: false, imageUrl: null,
    optionGroups: [{
        id: "33333333-3333-3333-3333-333333333333", name: "추가", minSelect: 1, maxSelect: 1,
        options: [{ id: OPTION_ID, name: "치즈", extraPrice: 500 }],
    }],
}];
const line = { key: "line", menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] };

describe("T-28 manual order input", () => {
    it("builds a KST timestamp and calculates option price and cumulative shortage", () => {
        const request = toManualOrderRequest([line], menu, "cash", "2026-10-03T20:00", KEY);
        expect(request?.manualOrderedAt).toBe("2026-10-03T11:00:00.000Z");
        expect(request?.items).toEqual([{ menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] }]);
        expect(manualOrderTotal([line], menu)).toBe(7000);
        expect(manualOrderShortages([line], menu)).toEqual(["호떡"]);
    });

    it("rejects missing required options, impossible dates, and future dates", () => {
        expect(toManualOrderRequest([{ ...line, optionIds: [] }], menu, "cash", "2026-10-03T20:00", KEY)).toBeNull();
        expect(toManualOrderRequest([line], menu, "cash", "2026-02-30T20:00", KEY)).toBeNull();
        expect(toManualOrderRequest([line], menu, "cash", "2099-01-01T10:00", KEY)).toBeNull();
    });

    it("keeps save unavailable when backend is not connected", () => {
        render(<ManualOrderForm menu={menu} />);
        expect((screen.getByRole("button", { name: "수기 주문 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("status").textContent).toContain("입력은 저장되지 않습니다");
    });

    it("prevents repeated save, preserves failed input and idempotency key for retry", async () => {
        let rejectFirst!: (error: Error) => void;
        const onSave = vi.fn()
            .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }))
            .mockResolvedValueOnce(undefined);
        render(<ManualOrderForm menu={menu} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText("메뉴 선택"), { target: { value: MENU_ID } });
        fireEvent.click(screen.getByLabelText(/치즈/));
        fireEvent.change(screen.getByLabelText("종이 주문 시각 (KST)"), { target: { value: "2026-10-03T20:00" } });
        const save = screen.getByRole("button", { name: "수기 주문 저장" });
        expect((save as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(save);
        expect(onSave).toHaveBeenCalledTimes(1);
        expect((screen.getByRole("button", { name: "저장 중…" }) as HTMLButtonElement).disabled).toBe(true);
        rejectFirst(new Error("network"));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장에 실패"));
        expect((screen.getByLabelText("메뉴 선택") as HTMLSelectElement).value).toBe(MENU_ID);
        fireEvent.click(screen.getByRole("button", { name: "수기 주문 저장" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
        expect(onSave.mock.calls[1][0].idempotencyKey).toBe(onSave.mock.calls[0][0].idempotencyKey);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장되었습니다"));
    });
});
