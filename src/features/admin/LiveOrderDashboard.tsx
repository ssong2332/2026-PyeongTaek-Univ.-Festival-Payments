"use client";

import { useState } from "react";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import { useOrdersFeed } from "@/features/admin/useOrdersFeed";
import { AdminOrderDtoSchema, AdminOrdersResponseSchema, type AdminOrderDto } from "@/lib/dto/adminOrder";

/** T-13의 인증된 서버 페이지 안에서 렌더링한다. */
export function LiveOrderDashboard() {
    const feed = useOrdersFeed();
    const [confirmed, setConfirmed] = useState<Record<string, AdminOrderDto>>({});
    const orders = feed.orders.map(order => {
        const response = confirmed[order.id];
        return response && response.updatedAt >= order.updatedAt ? response : order;
    });
    return <OrderDashboard orders={orders} isLoading={feed.isLoading} error={feed.error}
        onReload={feed.reload}
        onSearch={async pickupNumber => {
            const response = await fetch(`/api/admin/orders?pickupNumber=${pickupNumber}`, { cache: "no-store" });
            if (!response.ok) throw new Error("Order search failed");
            return AdminOrdersResponseSchema.parse(await response.json()).orders;
        }}
        onAcknowledge={async id => {
            // 기존 피드의 acknowledge는 비-2xx 오류를 반환하지 않으므로 UI에서 응답을 검증한다.
            const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
            if (!response.ok) throw new Error("Acknowledge failed");
            const updated = AdminOrderDtoSchema.parse(await response.json());
            setConfirmed(previous => ({ ...previous, [updated.id]: updated }));
        }} />;
}
