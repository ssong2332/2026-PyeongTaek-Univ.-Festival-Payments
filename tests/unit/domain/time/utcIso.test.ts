import { describe, expect, it } from "vitest";
import { toUtcIsoString } from "@/domain/time/utcIso";

describe("toUtcIsoString", () => {
    it("DB 시각(µs, +00:00)을 밀리초 ISO UTC(Z)로 바꾼다", () => {
        expect(toUtcIsoString("2026-10-07T01:02:03.123456+00:00")).toBe("2026-10-07T01:02:03.123Z");
    });

    it("이미 Z인 시각은 밀리초 세 자리로만 맞춘다", () => {
        expect(toUtcIsoString("2026-10-07T01:02:03.123Z")).toBe("2026-10-07T01:02:03.123Z");
        expect(toUtcIsoString("2026-10-07T01:02:03Z")).toBe("2026-10-07T01:02:03.000Z");
    });

    it("다른 오프셋은 UTC로 옮긴다(콜론 유무 모두)", () => {
        expect(toUtcIsoString("2026-10-08T00:30:00+09:00")).toBe("2026-10-07T15:30:00.000Z");
        expect(toUtcIsoString("2026-10-08T00:30:00+0900")).toBe("2026-10-07T15:30:00.000Z");
    });

    it("밀리초 아래는 반올림하지 않고 버린다 — 반올림하면 KST 날짜가 바뀌는 경계", () => {
        expect(toUtcIsoString("2026-10-07T14:59:59.999999+00:00")).toBe("2026-10-07T14:59:59.999Z");
    });

    it("null은 null", () => {
        expect(toUtcIsoString(null)).toBeNull();
    });

    it("오프셋이 없으면 RangeError — 로컬 시간대로 해석되는 것을 막는다", () => {
        expect(() => toUtcIsoString("2026-10-07T01:02:03")).toThrow(RangeError);
        expect(() => toUtcIsoString("2026-10-07")).toThrow(RangeError);
    });

    it("해석할 수 없는 문자열은 RangeError", () => {
        expect(() => toUtcIsoString("not-a-date")).toThrow(RangeError);
        expect(() => toUtcIsoString("")).toThrow(RangeError);
        expect(() => toUtcIsoString("x+00:00")).toThrow(RangeError);
    });
});
