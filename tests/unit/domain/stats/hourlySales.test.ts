import { expect, it } from "vitest";
import { aggregateHourlyMenuSales, type HourlySaleOrder } from "@/domain/stats/hourlySales";

const menuA = "00000000-0000-4000-8000-000000000001";
const menuB = "00000000-0000-4000-8000-000000000002";
const order = (status: HourlySaleOrder["status"], createdAt: string, menuItemId = menuA, quantity = 1): HourlySaleOrder => ({
    status, createdAt, items: [{ menuItemId, nameKo: menuItemId === menuA ? "기본호떡" : "치즈호떡", quantity }],
});

it("groups sold quantities by KST clock hour and menu, excluding refunds and the adjacent day", () => {
    const result = aggregateHourlyMenuSales([
        order("paid", "2099-02-01T14:59:59Z", menuA, 10), // KST 02-01 23:59
        order("paid", "2099-02-01T15:00:00Z", menuA, 2), // KST 02-02 00:00
        order("cooking", "2099-02-01T15:30:00Z", menuA, 3),
        order("completed", "2099-02-02T03:00:00Z", menuB, 4), // KST 12:00
        order("refunded", "2099-02-02T03:10:00Z", menuA, 20),
        order("pending", "2099-02-02T03:20:00Z", menuA, 20),
        order("paid", "2099-02-02T15:00:00Z", menuA, 20), // KST 02-03 00:00
    ], "2099-02-02");

    expect(result).toEqual([
        { hour: 0, menuItemId: menuA, nameKo: "기본호떡", quantity: 5 },
        { hour: 12, menuItemId: menuB, nameKo: "치즈호떡", quantity: 4 },
    ]);
});

it("groups all dates by hour of day and handles no sales", () => {
    expect(aggregateHourlyMenuSales([
        order("paid", "2099-02-01T15:00:00Z", menuA, 2),
        order("completed", "2099-02-02T15:00:00Z", menuA, 3),
    ], "all")).toEqual([{ hour: 0, menuItemId: menuA, nameKo: "기본호떡", quantity: 5 }]);
    expect(aggregateHourlyMenuSales([order("cancelled", "2099-02-01T15:00:00Z")], "all")).toEqual([]);
    expect(() => aggregateHourlyMenuSales([], "2099-02-30")).toThrow(RangeError);
});
