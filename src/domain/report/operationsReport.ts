import { formatManualNumber } from "@/domain/order/manualNumber";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/order/status";
import type { MenuSales, StatsSummary } from "@/domain/stats/aggregate";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";

// 리포트 1회에 get_stats를 날짜 수만큼 부른다 — 호출 수 상한.
export const REPORT_MAX_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportReviewRecord {
    pickupNumber: number;
    manualNumber: number | null;
    // 주문의 날짜 기준 시각(수기 주문은 manual_ordered_at) — get_stats·CSV와 같은 날짜 규칙으로 기간을 고른다.
    orderedAt: string;
    rating: number;
    text: string | null;
    createdAt: string;
}

export interface ReportSummary {
    sales: number;
    orderCount: number;
    refundedAmount: number;
    cancelledCount: number;
    refundedCount: number;
    expiredCount: number;
    totals: Record<OrderStatus, number>;
    byMenu: MenuSales[];
}

export interface ReportDay extends ReportSummary {
    date: string;
}

export interface ReportReviewItem {
    displayNumber: string;
    rating: number;
    text: string | null;
    createdAt: string;
}

export interface OperationsReport {
    from: string;
    to: string;
    isEmpty: boolean;
    days: ReportDay[];
    // 기간 합계(from~to) — 일별 값의 합
    periodTotal: ReportSummary;
    reviews: { count: number; averageRating: number | null; items: ReportReviewItem[] };
}

/** KST 날짜 from~to(양끝 포함)를 하루씩 나열한다. 형식·달력 오류, 역순, 상한 초과는 RangeError. */
export function listReportDates(from: string, to: string): string[] {
    const start = Date.parse(kstDayUtcRange(from).start);
    const end = Date.parse(kstDayUtcRange(to).start);
    if (start > end) throw new RangeError("from must not be after to");
    const count = Math.round((end - start) / DAY_MS) + 1;
    if (count > REPORT_MAX_DAYS) throw new RangeError(`report range must be at most ${REPORT_MAX_DAYS} days`);
    return Array.from({ length: count }, (_, i) => kstDate(new Date(start + i * DAY_MS).toISOString()));
}

function emptyTotals(): Record<OrderStatus, number> {
    return { pending: 0, paid: 0, cooking: 0, completed: 0, cancelled: 0, refunded: 0, expired: 0 };
}

function toReportDay(summary: StatsSummary): ReportDay {
    const totals = emptyTotals();
    for (const status of ORDER_STATUSES) totals[status] = summary.totals[status];
    return {
        date: summary.date,
        sales: summary.sales,
        orderCount: summary.orderCount,
        refundedAmount: summary.refundedAmount,
        cancelledCount: totals.cancelled,
        refundedCount: summary.refundedCount,
        expiredCount: totals.expired,
        totals,
        byMenu: summary.byMenu.map(menu => ({
            menuItemId: menu.menuItemId, nameKo: menu.nameKo, quantity: menu.quantity, ratio: menu.ratio,
        })),
    };
}

// 날짜별 get_stats 결과를 더한다. 날짜 구간이 겹치지 않으므로 일별 값의 합이 곧 기간 합계다.
function sumDays(days: readonly ReportDay[]): ReportSummary {
    const totals = emptyTotals();
    const menus = new Map<string, { nameKo: string; quantity: number }>();
    let sales = 0;
    let orderCount = 0;
    let refundedAmount = 0;
    let refundedCount = 0;
    let soldQuantity = 0;

    for (const day of days) {
        sales += day.sales;
        orderCount += day.orderCount;
        refundedAmount += day.refundedAmount;
        refundedCount += day.refundedCount;
        for (const status of ORDER_STATUSES) totals[status] += day.totals[status];
        for (const menu of day.byMenu) {
            soldQuantity += menu.quantity;
            const current = menus.get(menu.menuItemId);
            if (!current) menus.set(menu.menuItemId, { nameKo: menu.nameKo, quantity: menu.quantity });
            else {
                current.quantity += menu.quantity;
                // get_stats는 메뉴 이름 스냅샷 중 min()을 쓴다 — 날짜를 합칠 때도 같은 쪽을 남긴다.
                if (menu.nameKo.localeCompare(current.nameKo, "ko") < 0) current.nameKo = menu.nameKo;
            }
        }
    }

    const byMenu = [...menus].map(([menuItemId, menu]) => ({
        menuItemId, nameKo: menu.nameKo, quantity: menu.quantity,
        ratio: soldQuantity === 0 ? 0 : menu.quantity / soldQuantity,
    })).sort((x, y) => y.quantity - x.quantity || x.menuItemId.localeCompare(y.menuItemId));

    return {
        sales, orderCount, refundedAmount,
        cancelledCount: totals.cancelled, refundedCount, expiredCount: totals.expired,
        totals, byMenu,
    };
}

function summarizeReviews(reviews: readonly ReportReviewRecord[], dates: ReadonlySet<string>) {
    const selected = reviews.filter(review => {
        if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
            throw new RangeError("rating must be an integer from 1 to 5");
        }
        if (!Number.isFinite(Date.parse(review.createdAt))) {
            throw new RangeError(`Invalid timestamp: ${review.createdAt}`);
        }
        return dates.has(kstDate(review.orderedAt));
    });
    const items = selected
        .toSorted((x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt) || x.pickupNumber - y.pickupNumber)
        .map(review => ({
            displayNumber: review.manualNumber === null
                ? String(review.pickupNumber)
                : formatManualNumber(review.manualNumber),
            rating: review.rating,
            text: review.text,
            createdAt: review.createdAt,
        }));
    const ratingSum = items.reduce((sum, item) => sum + item.rating, 0);
    // 소수 첫째 자리 반올림. 정수 합에서 계산해 부동소수 오차로 반올림이 어긋나지 않게 한다.
    const averageRating = items.length === 0 ? null : Math.round((ratingSum * 10) / items.length) / 10;
    return { count: items.length, averageRating, items };
}

/**
 * T-47 운영 회고 리포트(F-41). 매출 규칙은 다시 만들지 않는다 — 날짜별 get_stats(T-21) 결과를 그대로 쓰고 더하기만 한다.
 * 기간 합계는 일별 행의 합이라 같은 기간의 CSV(T-22) 합계와 같다.
 */
export function buildOperationsReport(input: {
    from: string;
    to: string;
    dailyStats: readonly StatsSummary[];
    reviews: readonly ReportReviewRecord[];
}): OperationsReport {
    const dates = listReportDates(input.from, input.to);
    if (input.dailyStats.length !== dates.length || input.dailyStats.some((day, i) => day.date !== dates[i])) {
        throw new RangeError("daily stats must cover every report date in order");
    }
    const days = input.dailyStats.map(toReportDay);
    const periodTotal = sumDays(days);
    const orderTotal = ORDER_STATUSES.reduce((sum, status) => sum + periodTotal.totals[status], 0);

    return {
        from: input.from,
        to: input.to,
        isEmpty: orderTotal === 0,
        days,
        periodTotal,
        reviews: summarizeReviews(input.reviews, new Set(dates)),
    };
}
