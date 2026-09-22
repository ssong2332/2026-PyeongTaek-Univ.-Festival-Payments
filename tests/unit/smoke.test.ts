import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "@/domain/i18n/locales";

describe("도메인 모듈 기본 동작 검사", () => {
    it("@/ 경로로 가져온 기본 언어는 한국어다", () => {
        expect(DEFAULT_LOCALE).toBe("ko");
    });
});
