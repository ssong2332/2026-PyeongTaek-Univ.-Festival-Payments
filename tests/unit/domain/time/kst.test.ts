import { describe, expect, it } from "vitest";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";

describe("kstDate", () => {
    it("UTC 15:00 이후는 KST 다음 날이다", () => {
        expect(kstDate("2026-10-07T14:59:59.999Z")).toBe("2026-10-07");
        expect(kstDate("2026-10-07T15:00:00.000Z")).toBe("2026-10-08");
        expect(kstDate("2026-10-07T15:30:00Z")).toBe("2026-10-08");
    });

    it("오프셋이 붙은 시각도 KST 날짜로 바꾼다", () => {
        expect(kstDate("2026-10-08T00:30:00+09:00")).toBe("2026-10-08");
    });

    it("해석할 수 없는 시각은 RangeError", () => {
        expect(() => kstDate("not-a-date")).toThrow(RangeError);
    });
});

describe("kstDayUtcRange", () => {
    it("KST 하루의 UTC 범위 [start, end)", () => {
        expect(kstDayUtcRange("2026-10-08")).toEqual({
            start: "2026-10-07T15:00:00.000Z", end: "2026-10-08T15:00:00.000Z",
        });
    });

    it("형식·달력이 틀리면 RangeError", () => {
        expect(() => kstDayUtcRange("2026-13-99")).toThrow(RangeError);
        expect(() => kstDayUtcRange("2026-02-30")).toThrow(RangeError);
        expect(() => kstDayUtcRange("20261008")).toThrow(RangeError);
    });
});
