import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/order/status";

// T-47 운영 회고 리포트(F-41) 응답 계약. 화면·PDF(T-48)가 그대로 import한다.
const count = z.number().int().nonnegative();
const kstDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ReportSummarySchema = z.strictObject({
    // F-28 매출(결제확인·조리중·완료 합계, 환불 제외) — get_stats와 같은 값
    sales: count,
    // 매출 대상 + 환불 건수(get_stats orderCount와 같은 정의)
    orderCount: count,
    refundedAmount: count,
    cancelledCount: count,
    refundedCount: count,
    expiredCount: count,
    totals: z.record(z.enum(ORDER_STATUSES), count),
    byMenu: z.array(z.strictObject({
        menuItemId: z.guid(),
        nameKo: z.string(),
        quantity: count,
        ratio: z.number().min(0).max(1),
    })),
});

export const ReportDaySchema = ReportSummarySchema.extend({ date: kstDate });

export const ReportReviewSchema = z.strictObject({
    // 고객 주문은 픽업 번호("12"), 수기 주문은 "M-001"
    displayNumber: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    text: z.string().nullable(),
    createdAt: z.iso.datetime(),
});

export const OperationsReportSchema = z.strictObject({
    from: kstDate,
    to: kstDate,
    // 기간 안 주문이 상태 무관 0건이면 true — 화면·PDF는 "데이터 없음" 리포트를 보여 준다
    isEmpty: z.boolean(),
    days: z.array(ReportDaySchema),
    total: ReportSummarySchema,
    reviews: z.strictObject({
        count,
        // 후기 0건이면 null("후기 없음"), 그 밖은 소수 첫째 자리 반올림
        averageRating: z.number().min(1).max(5).nullable(),
        items: z.array(ReportReviewSchema),
    }),
});

export type ReportSummaryDto = z.infer<typeof ReportSummarySchema>;
export type ReportDayDto = z.infer<typeof ReportDaySchema>;
export type ReportReviewDto = z.infer<typeof ReportReviewSchema>;
export type OperationsReportDto = z.infer<typeof OperationsReportSchema>;
