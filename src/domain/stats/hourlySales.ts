import type { OrderStatus } from "@/domain/order/status";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";

export interface HourlySaleOrder {
    status: OrderStatus;
    createdAt: string;
    items: readonly { menuItemId: string; nameKo: string; quantity: number }[];
}

export interface HourlyMenuSale {
    hour: number;
    menuItemId: string;
    nameKo: string;
    quantity: number;
}

const soldStatuses = new Set<OrderStatus>(["paid", "cooking", "completed"]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** T-26: order time and sales eligibility match T-21. "all" groups the same clock hour across days. */
export function aggregateHourlyMenuSales(orders: readonly HourlySaleOrder[], date: string): HourlyMenuSale[] {
    if (date !== "all") kstDayUtcRange(date);
    const totals = new Map<string, HourlyMenuSale>();

    for (const order of orders) {
        if (!soldStatuses.has(order.status) || (date !== "all" && kstDate(order.createdAt) !== date)) continue;
        const timestamp = Date.parse(order.createdAt);
        if (!Number.isFinite(timestamp)) throw new RangeError(`Invalid timestamp: ${order.createdAt}`);
        const hour = new Date(timestamp + KST_OFFSET_MS).getUTCHours();

        for (const item of order.items) {
            if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) throw new RangeError("Invalid item quantity");
            const key = `${hour}:${item.menuItemId}`;
            const current = totals.get(key);
            if (current) {
                current.quantity += item.quantity;
                if (item.nameKo.localeCompare(current.nameKo, "ko") < 0) current.nameKo = item.nameKo;
            } else {
                totals.set(key, { hour, menuItemId: item.menuItemId, nameKo: item.nameKo, quantity: item.quantity });
            }
        }
    }

    return [...totals.values()].sort((a, b) => a.hour - b.hour || a.menuItemId.localeCompare(b.menuItemId));
}
