import { describe, expect, it } from "vitest";
import type { ManualOrderMenu } from "@/features/admin/manualOrder";
import { manualOrderErrorCode, toManualOrderRequest } from "@/features/admin/manualOrder";

const MENU_ID = "11111111-1111-1111-1111-111111111111";
const OPTION_ID = "22222222-2222-2222-2222-222222222222";
const KEY = "a19ac145-4e29-47c0-aadd-f53531211996";

const historicalMenu: ManualOrderMenu[] = [{
    id: MENU_ID,
    name: "예전 호떡",
    description: null,
    price: 3000,
    stock: 0,
    isRecommended: false,
    isActive: false,
    isAvailable: false,
    isSoldOut: true,
    imageUrl: null,
    optionGroups: [{
        id: "33333333-3333-3333-3333-333333333333",
        name: "예전 필수 토핑",
        minSelect: 1,
        maxSelect: 1,
        isActive: false,
        options: [{ id: OPTION_ID, name: "예전 치즈", extraPrice: 500 }],
    }],
}];

describe("T-28 manual order API/UI contract", () => {
    it("reads MANUAL_NUMBER_TAKEN from the common API error envelope", () => {
        expect(manualOrderErrorCode({
            error: { code: "MANUAL_NUMBER_TAKEN", message: "This manual order number is already used." },
        })).toBe("MANUAL_NUMBER_TAKEN");
        expect(manualOrderErrorCode({ code: "MANUAL_NUMBER_TAKEN" })).toBeUndefined();
        expect(manualOrderErrorCode(null)).toBeUndefined();
    });

    it("does not enforce minSelect for an inactive historical option group", () => {
        const request = toManualOrderRequest([
            { key: "line", menuItemId: MENU_ID, quantity: 1, optionIds: [] },
        ], historicalMenu, "cash", "2026-10-03T20:00", KEY, 1);
        expect(request).not.toBeNull();
        expect(request?.items[0].optionIds).toEqual([]);
    });
});
