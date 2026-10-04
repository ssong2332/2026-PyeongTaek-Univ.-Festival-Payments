"use client";

import { useRef, useState } from "react";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import { SettingsPanel, type SettingsApi } from "@/components/admin/SettingsPanel";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { aggregateStats } from "@/domain/stats/aggregate";
import { availableActions, resolveTransition } from "@/domain/order/stateMachine";

async function loadPreviewStats(date: string) {
    return aggregateStats(makePreviewOrders().map(order => ({
        id: order.id, status: order.status, totalAmount: order.totalAmount,
        createdAt: order.createdAt, items: order.items.map(item => ({
            menuItemId: order.id, nameKo: item.menuNameKo, quantity: item.quantity,
        })),
    })), date);
}

export function makePreviewOrders(): AdminOrderDto[] {
    const menus = [["기본 호떡", 2000], ["뿌링클 호떡", 2500], ["불닭 콘치즈 호떡", 3500], ["말차 화이트초코 호떡", 3500]] as const;
    return menus.map(([name, price], i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        pickupNumber: i + 1, status: (["pending", "pending", "cooking", "completed"] as const)[i],
        paymentMethod: i % 2 ? "transfer" : "cash", totalAmount: price * 2,
        items: [{ menuNameKo: name, quantity: 2, options: [], lineTotal: price * 2 }],
        createdAt: `2026-09-25T10:${String(30 - i).padStart(2, "0")}:00.000Z`, updatedAt: "2026-09-25T10:30:00.000Z",
        acknowledgedAt: i < 2 ? null : "2026-09-25T10:30:00.000Z",
        transferReportedAt: i === 1 ? "2026-09-25T10:30:00.000Z" : null,
        cancelRequestedAt: null, cancelRejectedAt: null, paidAt: i > 1 ? "2026-09-25T10:30:00.000Z" : null,
        cookingStartedAt: null, completedAt: null, closedAt: null, refundChannel: null,
        lastReason: null, availableActions: availableActions({
            status: (["pending", "pending", "cooking", "completed"] as const)[i],
            paymentMethod: i % 2 ? "transfer" : "cash",
        }),
    }));
}
export function DashboardPreview() {
    const [orders, setOrders] = useState(makePreviewOrders);
    const current = useRef(orders);
    const [settingsApi] = useState<SettingsApi>(() => {
        let values = { "auto_complete.enabled": "false", "auto_complete.minutes": "15" };
        return {
            load: async () => ({ ...values }),
            save: async changes => { values = { ...values, ...changes }; return { ...values }; },
        };
    });
    function replace(next: AdminOrderDto[]) { current.current = next; setOrders(next); }
    return <OrderDashboard orders={orders} preview settingsPanel={<SettingsPanel api={settingsApi} />}
        onReload={async () => replace(makePreviewOrders())}
        onLoadStats={loadPreviewStats}
        onSearch={async number => current.current.filter(order => order.pickupNumber === number)}
        onAcknowledge={async id => replace(current.current.map(order => order.id === id ? {
            ...order, acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        } : order))}
        onTransition={async (id, action, input) => {
            const order = current.current.find(item => item.id === id);
            if (!order) throw new Error("Order not found");
            const result = resolveTransition(order, action, input ?? {});
            if (!result.ok) throw new Error(result.code);
            replace(current.current.map(item => item.id === id ? {
                ...item, status: result.to, updatedAt: new Date().toISOString(),
                lastReason: input?.reason ?? item.lastReason,
                refundChannel: input?.refundChannel ?? item.refundChannel,
                closedAt: result.restoreStock ? new Date().toISOString() : item.closedAt,
                availableActions: availableActions({ status: result.to, paymentMethod: item.paymentMethod }),
            } : item));
        }} />;
}
