import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateHourlyMenuSales, type HourlyMenuSale, type HourlySaleOrder } from "@/domain/stats/hourlySales";
import { kstDayUtcRange } from "@/domain/time/kst";
import { AppError } from "@/lib/api/errors";

const PAGE_SIZE = 500;

interface DbOrder {
    created_at: string;
    status: HourlySaleOrder["status"];
    order_items: { menu_item_id: string; menu_name_ko: string; quantity: number }[];
}

/** Reads only the snapshots needed for the hourly chart. Pagination avoids PostgREST's row limit. */
export async function loadHourlyMenuSales(client: SupabaseClient, date: string): Promise<HourlyMenuSale[]> {
    const range = date === "all" ? null : kstDayUtcRange(date);
    const orders: HourlySaleOrder[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = client.from("orders")
            .select("id, created_at, status, order_items ( menu_item_id, menu_name_ko, quantity )")
            .in("status", ["paid", "cooking", "completed"]);
        if (range) query = query.gte("created_at", range.start).lt("created_at", range.end);
        const { data, error } = await query
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new AppError("INTERNAL_ERROR", 500);
        const page = (data ?? []) as unknown as DbOrder[];
        orders.push(...page.map(order => ({
            status: order.status, createdAt: order.created_at,
            items: order.order_items.map(item => ({
                menuItemId: item.menu_item_id, nameKo: item.menu_name_ko, quantity: item.quantity,
            })),
        })));
        if (page.length < PAGE_SIZE) break;
    }

    return aggregateHourlyMenuSales(orders, date);
}
