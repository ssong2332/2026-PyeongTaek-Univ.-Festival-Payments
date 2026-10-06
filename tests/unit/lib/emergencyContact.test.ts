import { describe, expect, it } from "vitest";
import { readEmergencyContact } from "@/lib/emergencyContact";

// 번호는 가짜(공개 저장소)
describe("readEmergencyContact — 관리자 비상 연락처", () => {
    it.each([
        ["01012345678", "010-1234-5678"],
        ["010-1234-5678", "010-1234-5678"],
        [" 010 1234 5678 ", "010-1234-5678"],
        ["0212345678", "02-1234-5678"],
        ["0311234567", "031-123-4567"],
    ])("%s → %s", (value, display) => {
        expect(readEmergencyContact(value)).toEqual({ display, tel: `tel:${value.replace(/\D/g, "")}` });
    });

    it("비었거나 번호가 아니면 줄을 보이지 않는다", () => {
        expect(readEmergencyContact(undefined)).toBeNull();
        expect(readEmergencyContact("")).toBeNull();
        expect(readEmergencyContact("abc")).toBeNull();
        expect(readEmergencyContact("123")).toBeNull();
    });
});
