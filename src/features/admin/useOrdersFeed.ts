"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import { availableActions } from "@/domain/order/stateMachine";
import { createAdminBrowserClient } from "@/infra/supabase/browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import type { OrderStatus, PaymentMethod, RefundChannel } from "@/domain/order/status";

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
 * Supabase Postgres changes 페이로드(snake_case)를 AdminOrderDto(camelCase) 패치로 변환
 */
export function mapPayloadToOrderPatch(raw: Record<string, unknown>): Partial<AdminOrderDto> {
    const patch: Partial<AdminOrderDto> = {};

    if ("status" in raw && typeof raw.status === "string") {
        patch.status = raw.status as OrderStatus;
    }
    if ("payment_method" in raw && typeof raw.payment_method === "string") {
        patch.paymentMethod = raw.payment_method as PaymentMethod;
    } else if ("paymentMethod" in raw && typeof raw.paymentMethod === "string") {
        patch.paymentMethod = raw.paymentMethod as PaymentMethod;
    }
    if ("pickup_number" in raw && typeof raw.pickup_number === "number") {
        patch.pickupNumber = raw.pickup_number;
    } else if ("pickupNumber" in raw && typeof raw.pickupNumber === "number") {
        patch.pickupNumber = raw.pickupNumber;
    }
    if ("total_amount" in raw && typeof raw.total_amount === "number") {
        patch.totalAmount = raw.total_amount;
    } else if ("totalAmount" in raw && typeof raw.totalAmount === "number") {
        patch.totalAmount = raw.totalAmount;
    }
    if ("acknowledged_at" in raw) {
        patch.acknowledgedAt = (raw.acknowledged_at as string | null) ?? null;
    } else if ("acknowledgedAt" in raw) {
        patch.acknowledgedAt = (raw.acknowledgedAt as string | null) ?? null;
    }
    if ("transfer_reported_at" in raw) {
        patch.transferReportedAt = (raw.transfer_reported_at as string | null) ?? null;
    } else if ("transferReportedAt" in raw) {
        patch.transferReportedAt = (raw.transferReportedAt as string | null) ?? null;
    }
    if ("cancel_requested_at" in raw) {
        patch.cancelRequestedAt = (raw.cancel_requested_at as string | null) ?? null;
    } else if ("cancelRequestedAt" in raw) {
        patch.cancelRequestedAt = (raw.cancelRequestedAt as string | null) ?? null;
    }
    if ("cancel_rejected_at" in raw) {
        patch.cancelRejectedAt = (raw.cancel_rejected_at as string | null) ?? null;
    } else if ("cancelRejectedAt" in raw) {
        patch.cancelRejectedAt = (raw.cancelRejectedAt as string | null) ?? null;
    }
    if ("paid_at" in raw) {
        patch.paidAt = (raw.paid_at as string | null) ?? null;
    } else if ("paidAt" in raw) {
        patch.paidAt = (raw.paidAt as string | null) ?? null;
    }
    if ("cooking_started_at" in raw) {
        patch.cookingStartedAt = (raw.cooking_started_at as string | null) ?? null;
    } else if ("cookingStartedAt" in raw) {
        patch.cookingStartedAt = (raw.cookingStartedAt as string | null) ?? null;
    }
    if ("completed_at" in raw) {
        patch.completedAt = (raw.completed_at as string | null) ?? null;
    } else if ("completedAt" in raw) {
        patch.completedAt = (raw.completedAt as string | null) ?? null;
    }
    if ("closed_at" in raw) {
        patch.closedAt = (raw.closed_at as string | null) ?? null;
    } else if ("closedAt" in raw) {
        patch.closedAt = (raw.closedAt as string | null) ?? null;
    }
    if ("refund_channel" in raw) {
        patch.refundChannel = (raw.refund_channel as RefundChannel | null) ?? null;
    } else if ("refundChannel" in raw) {
        patch.refundChannel = (raw.refundChannel as RefundChannel | null) ?? null;
    }
    if ("updated_at" in raw && typeof raw.updated_at === "string") {
        patch.updatedAt = raw.updated_at;
    } else if ("updatedAt" in raw && typeof raw.updatedAt === "string") {
        patch.updatedAt = raw.updatedAt;
    }

    return patch;
}

/**
 * ADR-0003: UPDATE 이벤트 병합 규칙
 * 기존 항목이 있고, 수신된 updated_at이 기존보다 더 새로울 때만 갱신 (오래된 역순 이벤트 무시)
 */
export function mergeOrderUpdate(
    currentOrder: AdminOrderDto,
    incoming: Record<string, unknown> | Partial<AdminOrderDto>,
): AdminOrderDto {
    const patch = mapPayloadToOrderPatch(incoming as Record<string, unknown>);
    const newUpdatedAtStr = patch.updatedAt;

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
        ...patch,
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
                            const updated = mergeOrderUpdate(existing, payload.new);
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
