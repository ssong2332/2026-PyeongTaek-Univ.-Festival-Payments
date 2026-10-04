"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { CreateOrderResponseSchema } from "@/lib/dto/order";

// #89: 주문이 성공하면 상태 페이지 토큰과 픽업 번호를 이 기기에 남겨, 메뉴판에서 주문 현황으로 돌아갈 수 있게 한다.
// 장바구니·멱등키(DECISIONS #23)와 달리 localStorage다 — QR로 연 탭을 닫고 다시 찍으면 새 탭이라 sessionStorage가 비어 있다.
// 키의 v1은 저장 형식 버전이다. 형식을 바꾸면 키를 올려 옛 값을 읽지 않는다.
export const MY_ORDERS_STORAGE_KEY = "ptu.myOrders.v1";
export const MY_ORDERS_LIMIT = 5;
export const MY_ORDER_TTL_MS = 24 * 60 * 60 * 1000;

// 토큰·픽업 번호는 주문 생성 응답과 같은 형식 규칙(상태 페이지도 같은 스키마로 토큰을 검사한다).
const SavedOrderSchema = z.object({
    statusToken: CreateOrderResponseSchema.shape.statusToken,
    pickupNumber: CreateOrderResponseSchema.shape.pickupNumber,
    savedAt: z.iso.datetime(),
});
export type SavedOrder = z.infer<typeof SavedOrderSchema>;

const listeners = new Set<() => void>();

// 서버 렌더링(window 없음)이거나 저장소 접근이 막힌 브라우저면 저장값이 없는 것으로 본다.
function readRaw(): string | null {
    try {
        return window.localStorage.getItem(MY_ORDERS_STORAGE_KEY);
    } catch {
        return null;
    }
}

function serialize(orders: readonly SavedOrder[]): string | null {
    return orders.length > 0 ? JSON.stringify(orders) : null;
}

// 저장값과 같으면 쓰지 않는다. 쓸 수 없는 환경(용량 초과·접근 차단)이면 기기에 남기지 못할 뿐 주문 흐름은 그대로 간다.
function write(raw: string | null, orders: readonly SavedOrder[]): void {
    const next = serialize(orders);
    if (next === raw) return;
    try {
        if (next === null) window.localStorage.removeItem(MY_ORDERS_STORAGE_KEY);
        else window.localStorage.setItem(MY_ORDERS_STORAGE_KEY, next);
    } catch {
        return;
    }
    listeners.forEach((listener) => listener());
}

function savedTime(order: SavedOrder): number {
    return Date.parse(order.savedAt);
}

// 저장값은 사용자가 바꿀 수 있다 — 깨진 JSON·형식이 틀린 항목·24시간 지난 항목을 버리고, 최신순·토큰 중복 없이 5건까지.
function parseOrders(raw: string | null, now: number = Date.now()): SavedOrder[] {
    if (raw === null) return [];
    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];
    const fresh = data.flatMap((item) => {
        const parsed = SavedOrderSchema.safeParse(item);
        return parsed.success && now - savedTime(parsed.data) < MY_ORDER_TTL_MS ? [parsed.data] : [];
    });
    fresh.sort((a, b) => savedTime(b) - savedTime(a));
    const unique = fresh.filter((order, index) => fresh.findIndex((other) => other.statusToken === order.statusToken) === index);
    return unique.slice(0, MY_ORDERS_LIMIT);
}

// 읽을 때 지난 항목·형식이 틀린 항목은 저장소에서도 지운다.
export function readMyOrders(now: Date = new Date()): SavedOrder[] {
    const raw = readRaw();
    const orders = parseOrders(raw, now.getTime());
    write(raw, orders);
    return orders;
}

// 주문 생성 성공 직후(화면 이동 전)에 부른다. 같은 토큰(멱등 재요청)은 한 건으로 합쳐 맨 앞에 둔다.
export function saveMyOrder(order: { statusToken: string; pickupNumber: number }, now: Date = new Date()): void {
    const entry = SavedOrderSchema.safeParse({
        statusToken: order.statusToken,
        pickupNumber: order.pickupNumber,
        savedAt: now.toISOString(),
    });
    if (!entry.success) return;
    const raw = readRaw();
    const others = parseOrders(raw, now.getTime()).filter((saved) => saved.statusToken !== entry.data.statusToken);
    write(raw, [entry.data, ...others].slice(0, MY_ORDERS_LIMIT));
}

// 상태 화면에서 주문이 없거나(404) 끝났을 때(취소·환불·만료) 부른다. 완료는 수령해야 하므로 24시간 규칙으로만 지운다.
export function forgetMyOrder(statusToken: string, now: Date = new Date()): void {
    const raw = readRaw();
    write(raw, parseOrders(raw, now.getTime()).filter((saved) => saved.statusToken !== statusToken));
}

// 같은 탭의 변경은 write가 알리고, 다른 탭의 변경은 storage 이벤트로 따라간다.
function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === MY_ORDERS_STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
    };
}

const getServerRaw = (): string | null => null;

// 메뉴판 "내 주문 현황 보기". 서버 HTML·하이드레이션 중에는 빈 목록(불일치 없음)이고, 마운트 뒤 이 기기의 저장값을 읽는다.
export function useMyOrders(): readonly SavedOrder[] {
    const raw = useSyncExternalStore(subscribe, readRaw, getServerRaw);
    useEffect(() => {
        readMyOrders();
    }, []);
    return useMemo(() => parseOrders(raw), [raw]);
}
