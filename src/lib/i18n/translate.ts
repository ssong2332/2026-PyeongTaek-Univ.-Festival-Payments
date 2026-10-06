import { DEFAULT_LOCALE, type Locale } from "@/domain/i18n/locales";
import en from "../../../messages/en.json";
import ko from "../../../messages/ko.json";

// UI 문자열 사전(F-05). 키 목록의 원본은 ko.json — 다른 언어 사전에 키가 없거나 공백뿐이면 한국어로 폴백한다(빈 문자열 노출 0건).
// 문구 안의 {name}은 vars 값으로 바꾼다. 언어를 더하려면 SUPPORTED_LOCALES와 messages/<코드>.json만 늘리면 된다.
export type MessageKey = keyof typeof ko;
export type Dictionary = Partial<Record<MessageKey, string>>;
export type MessageVars = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, vars?: MessageVars) => string;

export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = { ko, en };

export function translate(dictionaries: Readonly<Record<string, Dictionary>>, locale: string, key: MessageKey, vars?: MessageVars): string {
    const requested = dictionaries[locale]?.[key];
    const template = requested?.trim() ? requested : (dictionaries[DEFAULT_LOCALE]?.[key] ?? key);
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function createT(locale: Locale, dictionaries: Readonly<Record<string, Dictionary>> = DICTIONARIES): Translate {
    return (key, vars) => translate(dictionaries, locale, key, vars);
}

// 화면 밖(테스트·기본값)에서 쓰는 한국어 번역 함수
export const koT: Translate = createT(DEFAULT_LOCALE);
