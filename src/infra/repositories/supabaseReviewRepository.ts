import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/order/status";
import { AppError } from "@/lib/api/errors";
import type { ReviewRepository } from "@/services/reviewPorts";

const orderSchema = z.object({ id: z.guid(), status: z.enum(ORDER_STATUSES) });
const reviewSchema = z.object({ created_at: z.iso.datetime({ offset: true }) });
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
