"use client";

import { useRef, useState } from "react";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { availableActions, resolveTransition } from "@/domain/order/stateMachine";

export function makePreviewOrders(): AdminOrderDto[] {
    const menus = [["기본호떡", 2000], ["뿌링클 호떡", 2500], ["불닭 치즈 호떡", 3500], ["맛다시 호떡", 4000]] as const;
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
    function replace(next: AdminOrderDto[]) { current.current = next; setOrders(next); }
    return <OrderDashboard orders={orders} preview
        onReload={async () => replace(makePreviewOrders())}
        onSearch={async number => current.current.filter(order => order.pickupNumber === number)}
        onAcknowledge={async id => replace(current.current.map(order => order.id === id ? {
            ...order, acknowledgedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        } : order))}
        onTransition={async (id, action) => {
            const order = current.current.find(item => item.id === id);
            if (!order) throw new Error("Order not found");
            const result = resolveTransition(order, action, {});
            if (!result.ok) throw new Error(result.code);
            replace(current.current.map(item => item.id === id ? {
                ...item, status: result.to, updatedAt: new Date().toISOString(),
                availableActions: availableActions({ status: result.to, paymentMethod: item.paymentMethod }),
            } : item));
        }} />;
}
