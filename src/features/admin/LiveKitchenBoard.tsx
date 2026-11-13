"use client";

import { useEffect, useState } from "react";
import { ConnectionBanner } from "@/components/admin/ConnectionBanner";
import { KitchenBoard } from "@/components/admin/KitchenBoard";
import { parseTransitionErrorCode, TransitionRequestError } from "@/features/admin/transitionError";
import { useConnectionMonitor } from "@/features/admin/useConnectionMonitor";
import { pickNewerOrder, useOrdersFeed } from "@/features/admin/useOrdersFeed";
import { KITCHEN_MAX_LIMIT, KITCHEN_PAGE_SIZE } from "@/domain/order/kitchenQueue";
import { AdminOrderDtoSchema, type AdminOrderDto } from "@/lib/dto/adminOrder";

const REFRESH_INTERVAL_MS = 15_000;

// 조리 화면 데이터 연결. 주문 관리와 같은 상태 변경 API를 쓰되, 주문 목록은 날짜와 상관없는 조리중 주문(scope=kitchen)을 받는다.
export function LiveKitchenBoard({ initialNow }: { initialNow: string }) {
    // 조리중 주문이 상한을 넘으면 "더 불러오기"로 200건씩 늘린다(최대 1000건).
    const [limit, setLimit] = useState(KITCHEN_PAGE_SIZE);
    const feed = useOrdersFeed({ scope: "kitchen", limit });
    const hiddenCount = feed.total === null ? 0 : Math.max(0, feed.total - limit);
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
    // 어느 쪽이 최신인지는 시각 값으로 비교한다(문자열은 소수초 자릿수·시간대 표기가 다르면 틀린다).
    const [confirmed, setConfirmed] = useState<Record<string, AdminOrderDto>>({});
    const orders = feed.orders.map((order) => {
        const response = confirmed[order.id];
        return response ? pickNewerOrder(order, response) : order;
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
        // 오래 켜 두는 화면이라, 피드에서 빠졌거나 피드가 더 최신이 된 응답은 정리해 쌓이지 않게 한다.
        setConfirmed((previous) => {
            const next: Record<string, AdminOrderDto> = {};
            for (const order of feed.orders) {
                const kept = previous[order.id];
                if (kept && pickNewerOrder(order, kept) === kept) next[order.id] = kept;
            }
            next[updated.id] = updated;
            return next;
        });
    }

    return (
        <>
            <ConnectionBanner disconnected={monitor.isDisconnected} retrying={monitor.isChecking} onRetry={async () => { await monitor.checkNow(); }} />
            <KitchenBoard orders={orders} isLoading={feed.isLoading} error={feed.error} initialNow={initialNow} onReload={reload} onComplete={completeOrder}
                hiddenCount={hiddenCount}
                onLoadMore={limit < KITCHEN_MAX_LIMIT ? () => setLimit((current) => Math.min(current + KITCHEN_PAGE_SIZE, KITCHEN_MAX_LIMIT)) : undefined} />
        </>
    );
}
