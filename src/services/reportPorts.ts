import type { ReportReviewRecord } from "@/domain/report/operationsReport";
import type { StatsSummary } from "@/domain/stats/aggregate";

export interface ReportRepository {
    // T-21 get_stats(date) 결과 그대로 — 매출 규칙을 리포트에서 다시 만들지 않는다.
    loadDailyStats(date: string): Promise<StatsSummary>;
    // 전체 후기. 기간 선택은 도메인이 주문 날짜 기준으로 한다.
    listReviews(): Promise<ReportReviewRecord[]>;
}
