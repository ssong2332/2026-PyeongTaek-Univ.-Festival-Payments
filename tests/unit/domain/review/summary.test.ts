import { describe, expect, it } from "vitest";
import { summarizeRatings } from "@/domain/review/summary";

describe("T-42 summarizeRatings", () => {
    it("F-41 예시처럼 후기 3건 평균을 소수 첫째 자리로 보여 준다", () => {
        expect(summarizeRatings([4, 4, 5])).toEqual({ count: 3, averageRating: 4.3 });
    });

    it("후기 0건이면 평균 없이 0건으로 돌려준다", () => {
        expect(summarizeRatings([])).toEqual({ count: 0, averageRating: null });
    });

    it.each([
        [[1], 1],
        [[5], 5],
        [[5, 5, 5, 5], 5],
        [[1, 1, 1, 1], 1],
    ])("한 건·같은 별점만 있으면 그 별점이 평균이다: %j", (ratings, average) => {
        expect(summarizeRatings(ratings)).toEqual({ count: ratings.length, averageRating: average });
    });

    it.each([
        // 4.25 → 4.3, 4.35 → 4.4 (정확히 반이면 올림)
        [[4, 4, 4, 5], 4.3],
        [[...Array<number>(13).fill(4), ...Array<number>(7).fill(5)], 4.4],
        // 4.333… → 4.3, 1.666… → 1.7, 2.5 → 2.5
        [[1, 2, 2], 1.7],
        [[2, 3], 2.5],
    ])("반올림 경계: %j → %d", (ratings, average) => {
        expect(summarizeRatings(ratings).averageRating).toBe(average);
    });

    it("수백 건도 부동소수 오차 없이 소수 첫째 자리 값으로 맞춘다", () => {
        const ratings = Array.from({ length: 300 }, (_, index) => (index % 5) + 1);
        expect(summarizeRatings(ratings)).toEqual({ count: 300, averageRating: 3 });
        const skewed = [...Array<number>(199).fill(5), 1];
        expect(summarizeRatings(skewed)).toEqual({ count: 200, averageRating: 5 });
    });
});
