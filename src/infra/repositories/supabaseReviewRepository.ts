import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/order/status";
import { AppError } from "@/lib/api/errors";
import type { AdminReviewDto } from "@/lib/dto/review";
import type { AdminReviewRepository, ReviewRepository } from "@/services/reviewPorts";

const orderSchema = z.object({ id: z.guid(), status: z.enum(ORDER_STATUSES) });
const reviewSchema = z.object({ created_at: z.iso.datetime({ offset: true }) });
const ADMIN_PAGE_SIZE = 500;
const adminReviewRowSchema = z.object({
    order_id: z.guid(),
    rating: z.int().min(1).max(5),
    text: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    orders: z.object({ pickup_number: z.int().positive(), manual_number: z.int().positive().nullable() }),
});

function toAdminReviewDto(row: z.infer<typeof adminReviewRowSchema>): AdminReviewDto {
    return {
        orderId: row.order_id,
        pickupNumber: row.orders.pickup_number,
        manualNumber: row.orders.manual_number,
        rating: row.rating,
        text: row.text,
        createdAt: new Date(row.created_at).toISOString(),
    };
}

// T-42: 후기는 orders에 1:1로 묶여 있어 픽업 번호(수기 주문이면 M 번호)를 함께 읽는다.
export function createSupabaseAdminReviewRepository(client: SupabaseClient): AdminReviewRepository {
    return {
        async listForAdmin(range) {
            const reviews: AdminReviewDto[] = [];
            for (let offset = 0; ; offset += ADMIN_PAGE_SIZE) {
                let query = client.from("reviews")
                    .select("order_id, rating, text, created_at, orders ( pickup_number, manual_number )");
                if (range) query = query.gte("created_at", range.start).lt("created_at", range.end);
                const { data, error } = await query
                    .order("created_at", { ascending: false })
                    .order("order_id", { ascending: true })
                    .range(offset, offset + ADMIN_PAGE_SIZE - 1);
                if (error) throw new AppError("INTERNAL_ERROR", 500);
                // 검증 실패 내용(zod issues)에는 후기 텍스트가 들어갈 수 있어 details로 넘기지 않는다.
                const parsed = z.array(adminReviewRowSchema).safeParse(data);
                if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
                reviews.push(...parsed.data.map(toAdminReviewDto));
                if (parsed.data.length < ADMIN_PAGE_SIZE) break;
            }
            return reviews;
        },
    };
}
export function createSupabaseReviewRepository(client: SupabaseClient): ReviewRepository {
    return {
        async findOrderByToken(token) {
            const { data, error } = await client.from("orders").select("id, status")
                .eq("status_token", token).maybeSingle();
            if (error) throw new AppError("INTERNAL_ERROR", 500);
            if (data === null) return null;
            const parsed = orderSchema.safeParse(data);
            if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
            return parsed.data;
        },
        async insert(input) {
            const { data, error } = await client.from("reviews").insert({
                order_id: input.orderId, rating: input.rating, text: input.text,
            }).select("created_at").single();
            if (error) {
                if (error.code === "23505") throw new AppError("REVIEW_ALREADY_SUBMITTED", 409);
                if (error.code === "23503") throw new AppError("NOT_FOUND", 404);
                if (error.code === "23514" && error.message === "REVIEW_REQUIRES_COMPLETED_ORDER") {
                    throw new AppError("REVIEW_NOT_ALLOWED", 409);
                }
                throw new AppError("INTERNAL_ERROR", 500);
            }
            const parsed = reviewSchema.safeParse(data);
            if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500);
            return { createdAt: new Date(parsed.data.created_at).toISOString() };
        },
    };
}
