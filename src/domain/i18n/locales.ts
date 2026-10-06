// 지원 언어의 원본(F-05). 화면 문구 사전(messages/*.json)·메뉴 API(?lang=)가 모두 이 목록을 따른다.
export const SUPPORTED_LOCALES = ["ko", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

export function isSupportedLocale(value: unknown): value is Locale {
    return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
