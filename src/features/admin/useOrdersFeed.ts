"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { availableActions } from "@/domain/order/stateMachine";
import { createAdminBrowserClient } from "@/infra/supabase/browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function deriveUnacknowledgedCount(ordersMap: Map<string, AdminOrderDto>): number {
    let count = 0;
    for (const order of ordersMap.values()) {
        if (
            order.acknowledgedAt === null &&
            ["pending", "paid", "cooking"].includes(order.status)
        ) {
            count++;
        }
    }
    return count;
}

/**
 * ADR-0003: UPDATE 이벤트 병합 규칙
 * 기존 항목이 있고, 수신된 updated_at이 기존보다 더 새로울 때만 갱신 (오래된 역순 이벤트 무시)
 */
export function mergeOrderUpdate(
    currentOrder: AdminOrderDto,
    updatedRow: Partial<AdminOrderDto> & { updatedAt?: string; updated_at?: string },
): AdminOrderDto {
    const newUpdatedAtStr = updatedRow.updatedAt ?? updatedRow.updated_at;
    if (newUpdatedAtStr) {
        const currentMs = new Date(currentOrder.updatedAt).getTime();
        const incomingMs = new Date(newUpdatedAtStr).getTime();
        if (incomingMs < currentMs) {
            // 오래된 이벤트는 무시
            return currentOrder;
        }
    }

    const merged: AdminOrderDto = {
        ...currentOrder,
        ...(updatedRow as Partial<AdminOrderDto>),
        updatedAt: newUpdatedAtStr ?? currentOrder.updatedAt,
    };

    // 상태나 결제 수단이 바뀌었을 수 있으므로 availableActions 재계산
    merged.availableActions = availableActions({
        status: merged.status,
        paymentMethod: merged.paymentMethod,
    });

    return merged;
}

export interface UseOrdersFeedReturn {
    orders: AdminOrderDto[];
    ordersMap: Map<string, AdminOrderDto>;
    unacknowledgedCount: number;
    isLoading: boolean;
    error: string | null;
    acknowledge: (id: string) => Promise<void>;
    reload: () => Promise<void>;
}

export function useOrdersFeed(initialDate?: string): UseOrdersFeedReturn {
    const [ordersMap, setOrdersMap] = useState<Map<string, AdminOrderDto>>(new Map());
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const dateRef = useRef(initialDate);
    useEffect(() => {
        dateRef.current = initialDate;
    }, [initialDate]);

    const loadOrders = useCallback(async () => {
        try {
            const query = dateRef.current ? `?date=${encodeURIComponent(dateRef.current)}` : "";
            const res = await fetch(`/api/admin/orders${query}`);
            if (!res.ok) {
                throw new Error(`Failed to fetch orders: ${res.status}`);
            }
            const data = await res.json();
            const newMap = new Map<string, AdminOrderDto>();
            for (const order of data.orders as AdminOrderDto[]) {
                newMap.set(order.id, order);
            }
            return { map: newMap, error: null };
        } catch (err) {
            return {
                map: null,
                error: err instanceof Error ? err.message : "Unknown error",
            };
        }
    }, []);

    const hydrateOrder = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/admin/orders/${id}`);
            if (res.ok) {
                const freshOrder: AdminOrderDto = await res.json();
                setOrdersMap((prev) => {
                    const next = new Map(prev);
                    next.set(freshOrder.id, freshOrder);
                    return next;
                });
            }
        } catch (err) {
            console.error("[useOrdersFeed] Failed to hydrate order:", id, err);
        }
    }, []);

    const acknowledge = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/admin/orders/${id}/acknowledge`, {
                method: "POST",
            });
            if (res.ok) {
                const updated: AdminOrderDto = await res.json();
                setOrdersMap((prev) => {
                    const next = new Map(prev);
                    next.set(updated.id, updated);
                    return next;
                });
            }
        } catch (err) {
            console.error("[useOrdersFeed] Failed to acknowledge order:", id, err);
        }
    }, []);

    // 1. 초기 마운트 시 주문 로드
    useEffect(() => {
        let isCancelled = false;
        loadOrders().then((result) => {
            if (isCancelled) return;
            if (result.map) {
                setOrdersMap(result.map);
                setError(null);
            } else {
                setError(result.error);
            }
            setIsLoading(false);
        });
        return () => {
            isCancelled = true;
        };
    }, [loadOrders]);

    // 2. Realtime 구독 설정 (ADR-0003)
    useEffect(() => {
        const supabase = createAdminBrowserClient();
        const channel = supabase
            .channel("orders-feed")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "orders" },
                (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
                    if (payload.eventType === "INSERT") {
                        const newId = payload.new?.id as string;
                        if (newId) {
                            hydrateOrder(newId);
                        }
                    } else if (payload.eventType === "UPDATE") {
                        const updatedId = payload.new?.id as string;
                        if (!updatedId) return;

                        setOrdersMap((prev) => {
                            const existing = prev.get(updatedId);
                            if (!existing) {
                                // 기존 Map에 없으면 하이드레이션
                                hydrateOrder(updatedId);
                                return prev;
                            }
                            const updated = mergeOrderUpdate(existing, payload.new as unknown as Partial<AdminOrderDto>);
                            const next = new Map(prev);
                            next.set(updatedId, updated);
                            return next;
                        });
                    }
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [hydrateOrder]);

    const reload = useCallback(async () => {
        setIsLoading(true);
        const result = await loadOrders();
        if (result.map) {
            setOrdersMap(result.map);
            setError(null);
        } else {
            setError(result.error);
        }
        setIsLoading(false);
    }, [loadOrders]);

    const sortedOrders = Array.from(ordersMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const unacknowledgedCount = deriveUnacknowledgedCount(ordersMap);

    return {
        orders: sortedOrders,
        ordersMap,
        unacknowledgedCount,
        isLoading,
        error,
        acknowledge,
        reload,
    };
}
