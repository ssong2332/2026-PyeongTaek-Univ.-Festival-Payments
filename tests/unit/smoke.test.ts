import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/domain/i18n/locales";

describe("T-01 smoke: domain 모듈 import 경로", () => {
    it("DEFAULT_LOCALE은 'ko'다", () => {
        expect(DEFAULT_LOCALE).toBe("ko");
    });

    it("DEFAULT_LOCALE은 SUPPORTED_LOCALES에 포함된다", () => {
        expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    });
});
