import type { SupabaseClient } from "@supabase/supabase-js";
import type { RateLimitRepository } from "@/services/ports";

export function createSupabaseRateLimitRepository(
    client: SupabaseClient,
): RateLimitRepository {
    return {
        async consume(scope, key, limit, windowSeconds, now) {
            const p_now = now ? now.toISOString() : undefined;
            const { data, error } = await client.rpc("consume_rate_limit", {
                p_scope: scope,
                p_key: key,
                p_limit: limit,
                p_window_seconds: windowSeconds,
                ...(p_now ? { p_now } : {}),
            });

            if (error) {
                throw error;
            }

            return Boolean(data);
        },
    };
}
