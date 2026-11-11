// 후기 별점 요약(T-42, F-37). 별점은 DB CHECK·DTO에서 이미 1~5 정수로 검증된 값만 받는다.
export interface RatingSummary {
    count: number;
    // 소수 첫째 자리 반올림(정확히 반이면 올림 — F-41 예시 "평균 4.3"). 0건이면 null(화면은 "후기 없음").
    averageRating: number | null;
}

export function summarizeRatings(ratings: readonly number[]): RatingSummary {
    if (ratings.length === 0) return { count: 0, averageRating: null };
    const sum = ratings.reduce((total, rating) => total + rating, 0);
    // 정수 합에 10을 곱한 뒤 나눠야 4.25 같은 반값이 부동소수 오차 없이 올림된다.
    return { count: ratings.length, averageRating: Math.round((sum * 10) / ratings.length) / 10 };
}
