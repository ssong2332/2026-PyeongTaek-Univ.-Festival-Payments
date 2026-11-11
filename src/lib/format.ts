import { DEFAULT_LOCALE, type Locale } from "@/domain/i18n/locales";

const WON = new Intl.NumberFormat("ko-KR");

// 금액 표기: 한국어 "5,000원", 그 밖의 언어 "₩5,000"(F-05).
export function formatWon(amount: number, locale: Locale = DEFAULT_LOCALE): string {
    return locale === "ko" ? `${WON.format(amount)}원` : `₩${WON.format(amount)}`;
}

// 옵션 추가 가격 표기(디자인): 0원은 "무료".
export function formatOptionPrice(extraPrice: number, locale: Locale = DEFAULT_LOCALE): string {
    if (extraPrice === 0) return locale === "ko" ? "무료" : "Free";
    return `+₩${WON.format(extraPrice)}`;
}
