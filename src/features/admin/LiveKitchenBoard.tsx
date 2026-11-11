"use client";

import { useEffect, useState } from "react";
import { ConnectionBanner } from "@/components/admin/ConnectionBanner";
import { KitchenBoard } from "@/components/admin/KitchenBoard";
import { parseTransitionErrorCode, TransitionRequestError } from "@/features/admin/transitionError";
import { useConnectionMonitor } from "@/features/admin/useConnectionMonitor";
import { useOrdersFeed } from "@/features/admin/useOrdersFeed";
import { AdminOrderDtoSchema, type AdminOrderDto } from "@/lib/dto/adminOrder";

const REFRESH_INTERVAL_MS = 15_000;

// 조리 화면 데이터 연결. 주문 관리와 같은 주문 피드·상태 변경 API를 쓴다.
export function LiveKitchenBoard({ initialNow }: { initialNow: string }) {
    const feed = useOrdersFeed();
    const { refresh, reload } = feed;
    const monitor = useConnectionMonitor({
        channelStatus: feed.channelStatus,
        onRecover: refresh,
        onDisconnectedTick: refresh,
    });

    // 실시간 이벤트가 누락돼도 화면이 켜져 있는 동안 주문을 다시 맞춘다.
    useEffect(() => {
        const refreshIfVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        const timer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
        document.addEventListener("visibilitychange", refreshIfVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", refreshIfVisible);
        };
    }, [refresh]);

    // 완료 응답을 실시간 이벤트보다 먼저 반영해, 누른 주문이 바로 목록에서 빠지게 한다.
    const [confirmed, setConfirmed] = useState<Record<string, AdminOrderDto>>({});
    const orders = feed.orders.map((order) => {
        const response = confirmed[order.id];
        return response && response.updatedAt >= order.updatedAt ? response : order;
    });

    async function completeOrder(id: string) {
        const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/transition`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "complete" }),
        });
        if (!response.ok) {
            const code = parseTransitionErrorCode(await response.json().catch(() => null));
            if (response.status === 409) await reload().catch(() => undefined);
            throw code ? new TransitionRequestError(code) : new Error("Order transition failed");
        }
        const updated = AdminOrderDtoSchema.parse(await response.json());
        setConfirmed((previous) => ({ ...previous, [updated.id]: updated }));
    }

    return (
        <>
            <ConnectionBanner disconnected={monitor.isDisconnected} retrying={monitor.isChecking} onRetry={async () => { await monitor.checkNow(); }} />
            <KitchenBoard orders={orders} isLoading={feed.isLoading} error={feed.error} initialNow={initialNow} onReload={reload} onComplete={completeOrder} />
        </>
    );
}
