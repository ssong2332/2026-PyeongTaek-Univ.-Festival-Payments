import { describe, expect, it } from "vitest";
import { formatOptionPrice, formatWon } from "@/lib/format";

describe("formatWon", () => {
    it.each([
        [2500, "2,500원"],
        [0, "0원"],
        [1234567, "1,234,567원"],
    ])("%i → %s", (amount, expected) => {
        expect(formatWon(amount)).toBe(expected);
    });
});

describe("formatOptionPrice — 옵션 추가 가격(디자인: +₩500 / 무료)", () => {
    it.each([
        [500, "+₩500"],
        [1000, "+₩1,000"],
        [0, "무료"],
    ])("%i → %s", (amount, expected) => {
        expect(formatOptionPrice(amount)).toBe(expected);
    });
});
