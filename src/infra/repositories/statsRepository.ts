import type { SupabaseClient } from "@supabase/supabase-js";
import type { StatsSummary } from "@/domain/stats/aggregate";
import { AppError } from "@/lib/api/errors";

/** Reads the database aggregate; the route/service will enforce admin access. */
export async function loadStats(client: SupabaseClient, date: string): Promise<StatsSummary> {
    const { data, error } = await client.rpc("get_stats", { p_date: date });
    if (error || !data) throw new AppError("INTERNAL_ERROR", 500);
    return data as StatsSummary;
}
