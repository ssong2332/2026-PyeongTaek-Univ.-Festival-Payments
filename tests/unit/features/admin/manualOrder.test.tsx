// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MenuItemDto } from "@/lib/dto/menu";
import type { AdminMenuDto } from "@/lib/dto/adminMenu";
import { ManualOrderForm } from "@/features/admin/ManualOrderForm";
import { ManualOrderSaveError, manualOrderShortages, manualOrderTotal, toManualOrderMenu, toManualOrderRequest } from "@/features/admin/manualOrder";

afterEach(cleanup);

const MENU_ID = "11111111-1111-1111-1111-111111111111";
const OPTION_ID = "22222222-2222-2222-2222-222222222222";
const SECOND_OPTION_ID = "44444444-4444-4444-4444-444444444444";
const SAUCE_OPTION_ID = "66666666-6666-6666-6666-666666666666";
const KEY = "a19ac145-4e29-47c0-aadd-f53531211996";
const menu: MenuItemDto[] = [{
    id: MENU_ID, name: "호떡", description: null, price: 3000, stock: 1,
    isRecommended: false, isAvailable: true, isSoldOut: false, imageUrl: null,
    optionGroups: [{
        id: "33333333-3333-3333-3333-333333333333", name: "추가", minSelect: 1, maxSelect: 1,
        options: [
            { id: OPTION_ID, name: "치즈", extraPrice: 500 },
            { id: SECOND_OPTION_ID, name: "콩가루", extraPrice: 500 },
        ],
    }, {
        id: "77777777-7777-7777-7777-777777777777", name: "불닭 소스 추가", minSelect: 0, maxSelect: 1,
        options: [{ id: SAUCE_OPTION_ID, name: "불닭 소스", extraPrice: 500 }],
    }],
}];
const line = { key: "line", menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] };
const successResult = {
    orderId: "88888888-8888-4888-8888-888888888888",
    manualNumber: 1,
    displayNumber: "M-001",
    status: "completed" as const,
    paymentMethod: "cash" as const,
    totalAmount: 7000,
    manualOrderedAt: "2026-10-03T11:00:00.000Z",
    createdAt: "2026-10-06T04:00:00.000Z",
    created: true,
    stockShortages: [],
};

describe("T-28 manual order input", () => {
    it("관리자 메뉴 조회에서 판매 종료 메뉴와 현재 비활성 옵션도 사후 입력 선택지에 남긴다", () => {
        const historical: AdminMenuDto = {
            id: MENU_ID,
            translations: { ko: { name: "예전 호떡", description: null } },
            basePrice: 3000, stock: 0, isRecommended: false, isSoldOutManual: false, isActive: false, sortOrder: 0, imageUrl: null,
            optionGroups: [{
                id: "33333333-3333-3333-3333-333333333333",
                translations: { ko: { name: "예전 토핑" } },
                minSelect: 0, maxSelect: 1, isActive: false,
                options: [{ id: OPTION_ID, translations: { ko: { name: "예전 치즈" } }, extraPrice: 500, isActive: false }],
            }],
        };
        const converted = toManualOrderMenu([historical]);
        expect(converted[0]).toMatchObject({
            name: "예전 호떡", isActive: false, isAvailable: false,
            optionGroups: [{ name: "예전 토핑", options: [{ name: "예전 치즈", extraPrice: 500 }] }],
        });
        render(<ManualOrderForm menu={converted} />);
        expect(screen.getByRole("option", { name: /예전 호떡.*판매 종료\(과거 메뉴\)/ })).toBeTruthy();
    });

    it("builds M number and KST timestamp and calculates option price and cumulative shortage", () => {
        const request = toManualOrderRequest([line], menu, "cash", "2026-10-03T20:00", KEY, 1);
        expect(request?.manualOrderedAt).toBe("2026-10-03T11:00:00.000Z");
        expect(request?.manualNumber).toBe(1);
        expect(request?.items).toEqual([{ menuItemId: MENU_ID, quantity: 2, optionIds: [OPTION_ID] }]);
        expect(manualOrderTotal([line], menu)).toBe(7000);
        expect(manualOrderShortages([line], menu)).toEqual(["호떡"]);
    });

    it("rejects invalid M number, missing required options, impossible dates, and future dates", () => {
        expect(toManualOrderRequest([line], menu, "cash", "2026-10-03T20:00", KEY, 0)).toBeNull();
        expect(toManualOrderRequest([line], menu, "cash", "2026-10-03T20:00", KEY, 10000)).toBeNull();
        expect(toManualOrderRequest([{ ...line, optionIds: [] }], menu, "cash", "2026-10-03T20:00", KEY, 1)).toBeNull();
        expect(toManualOrderRequest([line], menu, "cash", "2026-02-30T20:00", KEY, 1)).toBeNull();
        expect(toManualOrderRequest([line], menu, "cash", "2099-01-01T10:00", KEY, 1)).toBeNull();
    });

    it("keeps save unavailable when backend is not connected", () => {
        render(<ManualOrderForm menu={menu} />);
        expect((screen.getByRole("button", { name: "수기 주문 저장" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("status").textContent).toContain("입력은 저장되지 않습니다");
    });

    it("allows one seasoning and an independent sauce in the finalized menu", () => {
        render(<ManualOrderForm menu={menu} />);
        fireEvent.change(screen.getByLabelText("메뉴 선택"), { target: { value: MENU_ID } });
        fireEvent.click(screen.getByLabelText(/치즈/));
        fireEvent.click(screen.getByLabelText(/콩가루/));
        fireEvent.click(screen.getByLabelText(/불닭 소스 \(\+500원\)/));
        expect((screen.getByLabelText(/치즈/) as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText(/콩가루/) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByLabelText(/불닭 소스 \(\+500원\)/) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByText("예상 합계 4,000원")).toBeTruthy();
    });

    it("prevents repeated save, preserves failed input/idempotency key, then displays server result", async () => {
        let rejectFirst!: (error: Error) => void;
        const onSave = vi.fn()
            .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
            .mockResolvedValueOnce(successResult);
        render(<ManualOrderForm menu={menu} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText("M 번호"), { target: { value: "1" } });
        fireEvent.change(screen.getByLabelText("메뉴 선택"), { target: { value: MENU_ID } });
        fireEvent.click(screen.getByLabelText(/치즈/));
        fireEvent.change(screen.getByLabelText("종이 주문 시각 (KST)"), { target: { value: "2026-10-03T20:00" } });
        const save = screen.getByRole("button", { name: "수기 주문 저장" });
        expect((save as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(save);
        expect(onSave).toHaveBeenCalledTimes(1);
        rejectFirst(new Error("network"));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("입력 내용을 유지"));
        expect((screen.getByLabelText("M 번호") as HTMLInputElement).value).toBe("1");
        expect((screen.getByLabelText("메뉴 선택") as HTMLSelectElement).value).toBe(MENU_ID);
        fireEvent.click(screen.getByRole("button", { name: "수기 주문 저장" }));
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
        expect(onSave.mock.calls[1][0].idempotencyKey).toBe(onSave.mock.calls[0][0].idempotencyKey);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("M-001 수기 주문이 저장되었습니다"));
    });

    it("keeps values and explains duplicate M number on 409 contract error", async () => {
        const onSave = vi.fn().mockRejectedValue(new ManualOrderSaveError("MANUAL_NUMBER_TAKEN"));
        render(<ManualOrderForm menu={menu} onSave={onSave} />);
        fireEvent.change(screen.getByLabelText("M 번호"), { target: { value: "7" } });
        fireEvent.change(screen.getByLabelText("메뉴 선택"), { target: { value: MENU_ID } });
        fireEvent.click(screen.getByLabelText(/치즈/));
        fireEvent.change(screen.getByLabelText("종이 주문 시각 (KST)"), { target: { value: "2026-10-03T20:00" } });
        fireEvent.click(screen.getByRole("button", { name: "수기 주문 저장" }));
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("M-007 번호는 이미 사용 중"));
        expect((screen.getByLabelText("M 번호") as HTMLInputElement).value).toBe("7");
    });
});
