import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ReportReviewRecord } from "@/domain/report/operationsReport";
import { toUtcIsoString } from "@/domain/time/utcIso";
import { AppError } from "@/lib/api/errors";
import type { ReportRepository } from "@/services/reportPorts";
import { loadStats } from "./statsRepository";

const PAGE_SIZE = 500;
const REVIEW_SELECT = "rating, text, created_at, orders ( pickup_number, manual_number, manual_ordered_at, created_at )";

const timestamp = z.iso.datetime({ offset: true });
const reviewRowSchema = z.object({
    rating: z.number().int().min(1).max(5),
    text: z.string().nullable(),
    created_at: timestamp,
    orders: z.object({
        pickup_number: z.number().int().positive(),
        manual_number: z.number().int().positive().nullable(),
        manual_ordered_at: timestamp.nullable(),
        created_at: timestamp,
    }),
});

function toReviewRecord(row: unknown): ReportReviewRecord {
    const parsed = reviewRowSchema.safeParse(row);
    if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
    const review = parsed.data;
    return {
        pickupNumber: review.orders.pickup_number,
        manualNumber: review.orders.manual_number,
        // 수기 주문(T-28)은 종이 주문 시각이 날짜 기준이다(get_stats 0104·CSV와 같은 규칙).
        orderedAt: toUtcIsoString(review.orders.manual_ordered_at ?? review.orders.created_at),
        rating: review.rating,
        text: review.text,
        createdAt: toUtcIsoString(review.created_at),
    };
}

export function createSupabaseReportRepository(client: SupabaseClient): ReportRepository {
    return {
        loadDailyStats: date => loadStats(client, date),
        async listReviews() {
            const reviews: ReportReviewRecord[] = [];
            for (let offset = 0; ; offset += PAGE_SIZE) {
                const { data, error } = await client.from("reviews").select(REVIEW_SELECT)
                    .order("created_at", { ascending: true })
                    .order("order_id", { ascending: true })
                    .range(offset, offset + PAGE_SIZE - 1);
                if (error) throw new AppError("INTERNAL_ERROR", 500);
                const page: unknown[] = data ?? [];
                reviews.push(...page.map(toReviewRecord));
                if (page.length < PAGE_SIZE) break;
            }
            return reviews;
        },
    };
}
