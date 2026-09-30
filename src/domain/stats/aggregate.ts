import type { OrderStatus } from "@/domain/order/status";

export interface StatsOrderItem {
    menuItemId: string;
    nameKo: string;
    quantity: number;
}

export interface StatsOrder {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    createdAt: string;
    items: readonly StatsOrderItem[];
}

export interface MenuSales {
    menuItemId: string;
    nameKo: string;
    quantity: number;
    ratio: number;
}

export interface StatsSummary {
    date: string;
    sales: number;
    orderCount: number;
    refundedAmount: number;
    refundedCount: number;
    byMenu: MenuSales[];
    totals: Record<OrderStatus, number>;
}

const includedInSales = new Set<OrderStatus>(["paid", "cooking", "completed"]);
const kstOffsetMs = 9 * 60 * 60 * 1000;

function kstDate(instant: string): string {
    const timestamp = Date.parse(instant);
    if (!Number.isFinite(timestamp)) throw new RangeError(`Invalid order timestamp: ${instant}`);
    return new Date(timestamp + kstOffsetMs).toISOString().slice(0, 10);
}

export function kstDayUtcRange(date: string): { start: string; end: string } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new RangeError("date must be YYYY-MM-DD");
    }
    const [year, month, day] = date.split("-").map(Number);
    const calendarDate = new Date(0);
    calendarDate.setUTCFullYear(year, month - 1, day);
    calendarDate.setUTCHours(0, 0, 0, 0);
    if (calendarDate.toISOString().slice(0, 10) !== date) {
        throw new RangeError("date must be a valid calendar day");
    }
    const start = calendarDate.getTime() - kstOffsetMs;
    return { start: new Date(start).toISOString(), end: new Date(start + 24 * 60 * 60 * 1000).toISOString() };
}

export function aggregateStats(orders: readonly StatsOrder[], date: string): StatsSummary {
    if (date !== "all") kstDayUtcRange(date);
    const totals: Record<OrderStatus, number> = {
        pending: 0, paid: 0, cooking: 0, completed: 0,
        cancelled: 0, refunded: 0, expired: 0,
    };
    const menuTotals = new Map<string, { nameKo: string; quantity: number }>();
    let sales = 0;
    let orderCount = 0;
    let refundedAmount = 0;
    let refundedCount = 0;
    let soldQuantity = 0;

    for (const order of orders) {
        if (date !== "all" && kstDate(order.createdAt) !== date) continue;
        totals[order.status]++;
        if (order.status === "refunded") {
            refundedAmount += order.totalAmount;
            refundedCount++;
            orderCount++;
        }
        if (!includedInSales.has(order.status)) continue;
        sales += order.totalAmount;
        orderCount++;
        for (const item of order.items) {
            const existing = menuTotals.get(item.menuItemId);
            if (existing) existing.quantity += item.quantity;
            else menuTotals.set(item.menuItemId, { nameKo: item.nameKo, quantity: item.quantity });
            soldQuantity += item.quantity;
        }
    }

    const byMenu = [...menuTotals].map(([menuItemId, value]) => ({
        menuItemId, nameKo: value.nameKo, quantity: value.quantity,
        ratio: soldQuantity === 0 ? 0 : value.quantity / soldQuantity,
    })).sort((a, b) => b.quantity - a.quantity || a.menuItemId.localeCompare(b.menuItemId));
    return { date, sales, orderCount, refundedAmount, refundedCount, byMenu, totals };
}
