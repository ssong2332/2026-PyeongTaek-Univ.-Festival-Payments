"use client";

import { useEffect } from "react";
import { SUPPORTED_LOCALES, type Locale } from "@/domain/i18n/locales";
import { setLocale, useLocale, useT } from "@/lib/i18n/locale";

// 언어 전환(F-05). 고른 언어는 이 기기에 남아 장바구니·결제·주문 현황 화면에도 이어진다.
// 버튼 이름은 각 언어 자기 이름으로 적어, 지금 화면 언어를 못 읽는 사람도 찾을 수 있게 한다.
const NATIVE_NAMES: Record<Locale, string> = { ko: "한국어", en: "EN" };

export function LanguageToggle() {
    const locale = useLocale();
    const t = useT();
    return (
        <div role="group" aria-label={t("language.label")} className="iron-card flex rounded-full p-1 text-xs font-bold">
            {SUPPORTED_LOCALES.map((code) => {
                const active = code === locale;
                return (
                    <button
                        key={code}
                        type="button"
                        lang={code}
                        aria-pressed={active}
                        onClick={() => setLocale(code)}
                        className={`min-h-9 min-w-11 rounded-full px-2.5 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-syrup ${
                            active ? "bg-syrup text-molasses" : "text-dough-dim hover:text-dough"
                        }`}
                    >
                        {NATIVE_NAMES[code]}
                    </button>
                );
            })}
        </div>
    );
}

// 문서 언어(<html lang>)를 화면 언어에 맞춘다 — 화면 읽기 프로그램 발음·번역 제안이 맞게 된다.
export function DocumentLang() {
    const locale = useLocale();
    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);
    return null;
}
