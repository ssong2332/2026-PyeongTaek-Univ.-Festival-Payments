import type { OrderStatus } from "@/domain/order/status";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";

// 기존 import 경로(@/domain/stats/aggregate) 호환.
export { kstDayUtcRange };

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
