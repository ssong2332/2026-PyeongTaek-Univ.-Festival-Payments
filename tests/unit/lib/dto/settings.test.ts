import { describe, expect, it } from "vitest";
import {
    ADMIN_SETTING_KEYS,
    SETTING_SCHEMAS,
    TRANSFER_SETTING_KEYS,
    AUTO_COMPLETE_SETTING_KEYS,
    PAYMENT_EXPIRE_SETTING_KEY,
    TransferSettingSchema,
    AutoCompleteEnabledSchema,
    MinutesSettingSchema,
} from "@/lib/dto/settings";

describe("T-52 / ADR-0004 settings DTO and schemas", () => {
    it("ADMIN_SETTING_KEYS는 ADR-0004의 6개 키를 정확히 포함한다", () => {
        expect(ADMIN_SETTING_KEYS).toEqual([
            TRANSFER_SETTING_KEYS.BANK_NAME,
            TRANSFER_SETTING_KEYS.ACCOUNT_NUMBER,
            TRANSFER_SETTING_KEYS.ACCOUNT_HOLDER,
            AUTO_COMPLETE_SETTING_KEYS.ENABLED,
            AUTO_COMPLETE_SETTING_KEYS.MINUTES,
            PAYMENT_EXPIRE_SETTING_KEY,
        ]);
        expect(ADMIN_SETTING_KEYS).toHaveLength(6);
    });

    describe("TransferSettingSchema (계좌 정보)", () => {
        it("200자 이하의 문자열과 빈 문자열(=미입력)을 허용한다", () => {
            expect(TransferSettingSchema.safeParse("").success).toBe(true);
            expect(TransferSettingSchema.safeParse("토스뱅크").success).toBe(true);
            expect(TransferSettingSchema.safeParse("a".repeat(200)).success).toBe(true);
        });

        it("200자를 초과하는 문자열은 거부한다", () => {
            expect(TransferSettingSchema.safeParse("a".repeat(201)).success).toBe(false);
        });
    });

    describe("AutoCompleteEnabledSchema (자동 완료 ON/OFF)", () => {
        it("'true'와 'false' 문자열만 허용한다", () => {
            expect(AutoCompleteEnabledSchema.safeParse("true").success).toBe(true);
            expect(AutoCompleteEnabledSchema.safeParse("false").success).toBe(true);
            expect(AutoCompleteEnabledSchema.safeParse("yes").success).toBe(false);
            expect(AutoCompleteEnabledSchema.safeParse("1").success).toBe(false);
            expect(AutoCompleteEnabledSchema.safeParse("").success).toBe(false);
        });
    });

    describe("MinutesSettingSchema (만료 및 자동 완료 분: 1..120)", () => {
        it("1부터 120 사이의 정수 문자열을 허용한다", () => {
            expect(MinutesSettingSchema.safeParse("1").success).toBe(true);
            expect(MinutesSettingSchema.safeParse("10").success).toBe(true);
            expect(MinutesSettingSchema.safeParse("120").success).toBe(true);
        });

        it("1 미만, 120 초과, 소수점 또는 숫자가 아닌 문자열은 거부한다", () => {
            expect(MinutesSettingSchema.safeParse("0").success).toBe(false);
            expect(MinutesSettingSchema.safeParse("-5").success).toBe(false);
            expect(MinutesSettingSchema.safeParse("121").success).toBe(false);
            expect(MinutesSettingSchema.safeParse("10.5").success).toBe(false);
            expect(MinutesSettingSchema.safeParse("abc").success).toBe(false);
            expect(MinutesSettingSchema.safeParse("").success).toBe(false);
        });
    });

    it("SETTING_SCHEMAS에 6개 모든 키의 스키마가 매핑되어 있다", () => {
        for (const key of ADMIN_SETTING_KEYS) {
            expect(SETTING_SCHEMAS[key]).toBeDefined();
        }
    });
});
