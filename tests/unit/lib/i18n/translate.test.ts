import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, isSupportedLocale } from "@/domain/i18n/locales";
import { DICTIONARIES, createT, koT, translate, type Dictionary, type MessageKey } from "@/lib/i18n/translate";
import en from "../../../../messages/en.json";
import ko from "../../../../messages/ko.json";

// T-04 (F-05): 번역 누락 시 한국어 폴백 — 빈 문자열 노출 0건.
const KEY: MessageKey = "cart.title";

describe("translate — 누락 번역 폴백", () => {
    it("요청 언어에 문구가 있으면 그 문구", () => {
        expect(translate(DICTIONARIES, "en", KEY)).toBe("Cart");
        expect(translate(DICTIONARIES, "ko", KEY)).toBe("장바구니");
    });

    it("요청 언어 사전에 키가 없으면 한국어", () => {
        const dictionaries: Record<string, Dictionary> = { ko: { [KEY]: "장바구니" }, en: {} };
        expect(translate(dictionaries, "en", KEY)).toBe("장바구니");
    });

    it("빈 문자열·공백뿐인 번역은 누락으로 보고 한국어", () => {
        const dictionaries: Record<string, Dictionary> = { ko: { [KEY]: "장바구니" }, en: { [KEY]: "   " } };
        expect(translate(dictionaries, "en", KEY)).toBe("장바구니");
        expect(translate({ ...dictionaries, en: { [KEY]: "" } }, "en", KEY)).toBe("장바구니");
    });

    it("사전이 없는 언어(나중에 추가될 언어 코드)도 한국어", () => {
        expect(translate(DICTIONARIES, "ja", KEY)).toBe("장바구니");
    });

    it("한국어에도 없으면 키를 그대로 보인다(빈 화면 대신)", () => {
        expect(translate({ ko: {}, en: {} }, "en", KEY)).toBe(KEY);
    });

    it("{이름} 자리에 값을 넣고, 없는 값은 그대로 둔다", () => {
        expect(createT("ko")("cart.issue.insufficientStock", { available: 3 })).toBe("재고가 부족해요. 이 메뉴는 모두 합쳐 3개까지 주문할 수 있어요.");
        expect(createT("en")("cart.issue.insufficientStock", { available: 3 })).toBe("Not enough stock. You can order up to 3 of this item in total.");
        expect(koT("cart.issue.insufficientStock")).toContain("{available}");
    });
});

describe("messages/*.json — 사전 점검", () => {
    it("지원 언어마다 사전이 있다", () => {
        for (const locale of SUPPORTED_LOCALES) expect(DICTIONARIES[locale]).toBeTruthy();
    });

    it("ko는 모든 키에 문구가 있다", () => {
        for (const [key, value] of Object.entries(ko)) expect(value.trim(), key).not.toBe("");
    });

    it("en은 ko의 키를 빠짐없이 번역했고 ko에 없는 키가 없다", () => {
        expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
        for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe("");
    });

    it("en 문구는 ko 문구와 같은 {이름} 자리를 쓴다", () => {
        const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        for (const [key, value] of Object.entries(en)) {
            // 조사(으로/로)는 한국어에만 있다
            const koSlots = slots(ko[key as MessageKey]).filter((slot) => slot !== "ro");
            expect(slots(value), key).toEqual(koSlots);
        }
    });
});

describe("isSupportedLocale", () => {
    it.each([
        ["ko", true],
        ["en", true],
        ["EN", false],
        ["", false],
        [null, false],
    ])("%o → %s", (value, expected) => {
        expect(isSupportedLocale(value)).toBe(expected);
    });
});
