"use client";

import { useEffect, useId, useState } from "react";
import { formatManualNumber } from "@/domain/order/manualNumber";
import type { AdminReviewDto, AdminReviewsResponse } from "@/lib/dto/review";
import styles from "./ReviewsSection.module.css";

const reviewNumber = (review: AdminReviewDto) => review.manualNumber !== null
    ? formatManualNumber(review.manualNumber) : `#${String(review.pickupNumber).padStart(3, "0")}`;
const reviewTime = (value: string) => new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const stars = (rating: number) => "★".repeat(rating) + "☆".repeat(5 - rating);

// T-42 후기 관리자 열람(F-37). 매출 통계와 따로 불러와 한쪽이 실패해도 다른 쪽은 보인다.
export function ReviewsSection({ loadReviews, date, refreshKey }: {
    loadReviews: (date: string) => Promise<AdminReviewsResponse>;
    date: string;
    refreshKey: number;
}) {
    const headingId = useId();
    const [attempt, setAttempt] = useState(0);
    const requestKey = `${date}|${refreshKey}|${attempt}`;
    // 응답을 요청 키와 함께 저장한다 — 키가 다르면 아직 불러오는 중(늦게 온 이전 날짜 응답은 버린다).
    const [loaded, setLoaded] = useState<{ key: string; result: AdminReviewsResponse | null } | null>(null);

    useEffect(() => {
        let active = true;
        loadReviews(date).then(result => {
            if (active) setLoaded({ key: requestKey, result });
        }).catch(() => {
            if (active) setLoaded({ key: requestKey, result: null });
        });
        return () => { active = false; };
    }, [date, requestKey, loadReviews]);

    const loading = loaded === null || loaded.key !== requestKey;
    const summary = loading ? null : loaded.result;
    return <section className={styles.section} aria-labelledby={headingId}>
        <div className={styles.heading}>
            <h2 id={headingId}>후기</h2>
            {summary && summary.averageRating !== null && <p className={styles.average}>
                <span>별점 평균</span>
                <strong>{summary.averageRating.toFixed(1)}</strong>
                <span aria-hidden="true">/ 5</span>
                <span className={styles.count}>{summary.count.toLocaleString("ko-KR")}건</span>
            </p>}
        </div>
        {/* 같은 날짜 선택을 쓰지만 기준이 다르다 — 후기는 작성 시각, 매출 통계는 주문 시각(수기는 종이 주문 시각). */}
        <p className={styles.basis}>후기 작성 날짜 기준 · 매출 통계는 주문 날짜 기준</p>
        {loading ? <p role="status" className={styles.message}>후기를 불러오는 중입니다…</p> :
            !summary ? <div role="alert" className={styles.error}>
                <p>후기를 불러오지 못했습니다.</p>
                <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 시도</button>
            </div> :
            summary.reviews.length === 0 ? <p className={styles.message}>후기 없음</p> :
            <ul className={styles.list}>
                {summary.reviews.map(review => <li key={review.orderId} className={styles.item}>
                    <div className={styles.meta}>
                        <span className={styles.number}>{reviewNumber(review)}</span>
                        <span role="img" aria-label={`별점 ${review.rating}점`} className={styles.stars}>{stars(review.rating)}</span>
                        <time dateTime={review.createdAt} className={styles.time}>{reviewTime(review.createdAt)}</time>
                    </div>
                    {review.text ? <p className={styles.text}>{review.text}</p>
                        : <p className={styles.empty}>별점만 남김</p>}
                </li>)}
            </ul>}
    </section>;
}
