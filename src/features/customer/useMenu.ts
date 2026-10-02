"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";
import { fetchJson } from "@/lib/api/client";
import { MenuResponseSchema, type MenuItemDto, type MenuLocale } from "@/lib/dto/menu";
import { QueueResponseSchema } from "@/lib/dto/order";

// Architecture 8절: 메뉴판은 GET /api/queue를 30초마다 다시 읽는다(F-11).
export const QUEUE_REFRESH_MS = 30_000;

export type MenuStatus = "loading" | "ready" | "error";

export interface UseMenuResult {
    status: MenuStatus;
    items: MenuItemDto[];
    waitingCount: number | null;
    reload: () => void;
}

interface MenuState {
    status: MenuStatus;
    items: MenuItemDto[];
    waitingCount: number | null;
}

export function useMenu(locale: MenuLocale = DEFAULT_LOCALE, options: { pollQueue?: boolean } = {}): UseMenuResult {
    const pollQueue = options.pollQueue ?? true;
    const [state, setState] = useState<MenuState>({ status: "loading", items: [], waitingCount: null });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchJson(`/api/menu?lang=${locale}`, {}, { parse: (data) => MenuResponseSchema.parse(data) })
            .then((menu) => {
                if (!cancelled) setState({ status: "ready", items: menu.items, waitingCount: menu.waitingCount });
            })
            .catch(() => {
                if (!cancelled) setState((prev) => ({ ...prev, status: "error" }));
            });
        return () => {
            cancelled = true;
        };
    }, [locale, attempt]);

    useEffect(() => {
        if (!pollQueue) return;
        let cancelled = false;
        const timer = setInterval(() => {
            fetchJson("/api/queue", {}, { parse: (data) => QueueResponseSchema.parse(data) })
                .then((queue) => {
                    if (!cancelled) setState((prev) => ({ ...prev, waitingCount: queue.waitingCount }));
                })
                // 대기 수 갱신 실패는 화면에 알리지 않는다 — 이전 값을 두고 다음 주기에 다시 읽는다.
                .catch(() => {});
        }, QUEUE_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [pollQueue]);

    const reload = useCallback(() => {
        setState((prev) => ({ ...prev, status: "loading" }));
        setAttempt((count) => count + 1);
    }, []);

    return { ...state, reload };
}
