"use client";

import { useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/domain/i18n/locales";
import { createT, type Translate } from "./translate";

// 고객이 고른 화면 언어(F-05). 이 기기 localStorage에 남겨 다른 화면·새로고침에도 이어진다.
// 서버 렌더와 첫 수화는 기본 언어(ko)로 그리고, 수화 직후 저장된 언어로 바꾼다(useSyncExternalStore).
// 저장소를 못 쓰면(사생활 보호 모드 등) 이 탭 메모리에만 둔다.
export const LOCALE_STORAGE_KEY = "hotteok-locale";

const listeners = new Set<() => void>();
let memoryLocale: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
    try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        return isSupportedLocale(stored) ? stored : DEFAULT_LOCALE;
    } catch {
        // 저장소를 못 읽으면 메모리 값을 쓴다.
        return memoryLocale;
    }
}

export function setLocale(locale: Locale): void {
    memoryLocale = locale;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
        // 저장 실패 — 이 탭에서만 바뀐다.
    }
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // 다른 탭에서 바꾼 언어도 따라간다.
    const onStorage = (event: StorageEvent) => {
        if (event.key === LOCALE_STORAGE_KEY) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

export function useLocale(): Locale {
    return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}

export function useT(): Translate {
    const locale = useLocale();
    return useMemo(() => createT(locale), [locale]);
}
