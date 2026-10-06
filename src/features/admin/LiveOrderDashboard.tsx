"use client";

import { useEffect, useRef, useState } from "react";
import { AttentionLayer, orderAlert, shouldAlertNewOrder, staffAlert, useAttention } from "@/components/admin/AttentionLayer";
import { ConnectionBanner } from "@/components/admin/ConnectionBanner";
import { MenuLifecyclePanel } from "@/components/admin/MenuLifecyclePanel";
import { OrderDashboard } from "@/components/admin/OrderDashboard";
import { MenuManagementPanel } from "@/components/admin/MenuManagementPanel";
import { SettingsPanel } from "@/components/admin/SettingsPanel";
import { StaffCallAlert } from "@/components/admin/StaffCallAlert";
import { useConnectionMonitor } from "@/features/admin/useConnectionMonitor";
import { useOrdersFeed } from "@/features/admin/useOrdersFeed";
import { useStaffCallsFeed } from "@/features/admin/useStaffCallsFeed";
import { useSweepHeartbeat } from "@/features/admin/useSweepHeartbeat";
import { parseTransitionErrorCode, TransitionRequestError } from "@/features/admin/transitionError";
import { useNewOrderSound } from "@/features/admin/useNewOrderSound";
import { AdminOrderDtoSchema, AdminOrdersResponseSchema, type AdminOrderDto } from "@/lib/dto/adminOrder";
import { AdminReviewsResponseSchema } from "@/lib/dto/review";
import { StatsDtoSchema } from "@/lib/dto/stats";

async function fetchStats(date: string) {
    const response = await fetch(`/api/admin/stats?date=${encodeURIComponent(date)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Stats request failed");
    return StatsDtoSchema.parse(await response.json());
}

async function fetchReviews(date: string) {
    const response = await fetch(`/api/admin/reviews?date=${encodeURIComponent(date)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Reviews request failed");
    return AdminReviewsResponseSchema.parse(await response.json());
}

/** T-13의 인증된 서버 페이지 안에서 렌더링한다. */
export function LiveOrderDashboard() {
    const sound = useNewOrderSound();
    // 소리를 못 들어도 알 수 있게 화면 알림(테두리 빛·알림 카드·탭 제목 깜빡임·진동)을 함께 띄운다
    const attention = useAttention();

    const feed = useOrdersFeed({
        onNewOrder: (order) => {
            if (!shouldAlertNewOrder(order)) return;
            void sound.play();
            attention.push(orderAlert(order));
        },
    });

    const staffFeed = useStaffCallsFeed();
    // 직원 호출: 처음 불러온 목록은 알리지 않고, 그 뒤 새로 생긴 호출만 알린다. 확인 처리돼 목록에서 빠지면 화면 알림도 닫는다.
    const seenCallIds = useRef<Set<string> | null>(null);
    const { push: pushAttention, dismiss: dismissAttention, alerts: attentionAlerts } = attention;
    const playSound = sound.play;
    useEffect(() => {
        if (staffFeed.isLoading) return;
        const ids = new Set(staffFeed.calls.map((call) => call.id));
        if (seenCallIds.current) {
            for (const call of staffFeed.calls) {
                if (!seenCallIds.current.has(call.id)) {
                    void playSound();
                    pushAttention(staffAlert(call));
                }
            }
        }
        seenCallIds.current = ids;
        for (const alert of attentionAlerts) {
            if (alert.kind === "staff" && !ids.has(alert.id.replace(/^staff-/, ""))) dismissAttention(alert.id);
        }
    }, [staffFeed.calls, staffFeed.isLoading, playSound, pushAttention, dismissAttention, attentionAlerts]);
    useSweepHeartbeat(feed.reload);

    const monitor = useConnectionMonitor({
        channelStatus: feed.channelStatus,
        onRecover: feed.refresh,
        onDisconnectedTick: feed.refresh,
    });
    // Realtime 이벤트가 드물게 누락되더라도 운영 화면이 자동으로 보정되도록
    // 화면이 활성 상태일 때 15초마다 주문 snapshot을 재조회한다.
    useEffect(() => {
        let inFlight = false;

        const refreshVisibleOrders = async () => {
            if (document.visibilityState !== "visible" || inFlight) {
                return;
            }

            inFlight = true;

            try {
                await feed.refresh();
            } finally {
                inFlight = false;
            }
        };

        const interval = window.setInterval(() => {
            void refreshVisibleOrders();
        }, 15_000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void refreshVisibleOrders();
            }
        };

        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );

        return () => {
            window.clearInterval(interval);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        };
    }, [feed.refresh]);
    const [confirmed, setConfirmed] = useState<Record<string, AdminOrderDto>>({});
    const orders = feed.orders.map(order => {
        const response = confirmed[order.id];
        return response && response.updatedAt >= order.updatedAt ? response : order;
    });
    return <>
        <AttentionLayer alerts={attention.alerts} onDismiss={attention.dismiss} />
        <StaffCallAlert calls={staffFeed.calls} onAcknowledge={staffFeed.acknowledge}
            isLoading={staffFeed.isLoading} error={staffFeed.error} onReload={staffFeed.reload} />
        <ConnectionBanner disconnected={monitor.isDisconnected}
            retrying={monitor.isChecking}
            onRetry={async () => { await monitor.checkNow(); }} />
        <div className="mb-3 flex justify-end">
            <button
                type="button"
                onClick={() => {
                    if (sound.enabled) {
                        sound.disable();
                    } else {
                        void sound.enable();
                    }
                }}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
            >
                {sound.enabled
                    ? "🔔 주문 알림음 켜짐"
                    : "🔕 주문 알림음 켜기"}
            </button>
        </div>
        <OrderDashboard orders={orders} isLoading={feed.isLoading} error={feed.error}
            settingsPanel={<SettingsPanel />}
            menuPanel={<><MenuLifecyclePanel /><MenuManagementPanel /></>}
            onReload={feed.reload}
            onLoadStats={fetchStats}
            onLoadReviews={fetchReviews}
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
            }}
            onCancelRequestDecision={async (id, decision, reason) => {
                const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/cancel-request`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ decision, reason }),
                });
                if (!response.ok) {
                    if (response.status === 409) await feed.reload().catch(() => undefined);
                    throw new Error("Cancel request decision failed");
                }
                const updated = AdminOrderDtoSchema.parse(await response.json());
                setConfirmed(previous => ({ ...previous, [updated.id]: updated }));
            }}
            onTransition={async (id, action, input) => {
                const response = await fetch(`/api/admin/orders/${encodeURIComponent(id)}/transition`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, ...input }),
                });
                if (!response.ok) {
                    const body: unknown = await response.json().catch(() => null);
                    const code = parseTransitionErrorCode(body);
                    if (response.status === 409) {
                        setConfirmed(previous => {
                            const next = { ...previous };
                            delete next[id];
                            return next;
                        });
                        await feed.reload().catch(() => undefined);
                    }
                    if (code && ((response.status === 400 && (code === "REASON_REQUIRED" || code === "REFUND_CHANNEL_REQUIRED"))
                        || (response.status === 409 && (code === "INVALID_TRANSITION" || code === "STATE_CHANGED")))) {
                        throw new TransitionRequestError(code);
                    }
                    throw new Error("Order transition failed");
                }
                const updated = AdminOrderDtoSchema.parse(await response.json());
                setConfirmed(previous => ({ ...previous, [updated.id]: updated }));
            }} />
    </>;
}
