import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateHourlyMenuSales, type HourlyMenuSale, type HourlySaleOrder } from "@/domain/stats/hourlySales";
import { AppError } from "@/lib/api/errors";

const PAGE_SIZE = 500;

interface DbOrder {
    created_at: string;
    source?: "customer" | "manual";
    manual_ordered_at?: string | null;
    status: HourlySaleOrder["status"];
    order_items: { menu_item_id: string; menu_name_ko: string; quantity: number }[];
}

/**
 * T-26/T-28: 시간대 히트맵은 매출 날짜 기준과 동일하게
 * 고객 주문은 created_at, 수기 주문은 manual_ordered_at을 사용한다.
 * 수기 주문은 입력일과 종이 주문일이 다를 수 있어 created_at 범위로 선필터하지 않는다.
 */
export async function loadHourlyMenuSales(client: SupabaseClient, date: string): Promise<HourlyMenuSale[]> {
    const orders: HourlySaleOrder[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await client.from("orders")
            .select("id, created_at, source, manual_ordered_at, status, order_items ( menu_item_id, menu_name_ko, quantity )")
            .in("status", ["paid", "cooking", "completed"])
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new AppError("INTERNAL_ERROR", 500);
        const page = (data ?? []) as unknown as DbOrder[];
        orders.push(...page.map(order => ({
            status: order.status,
            createdAt: order.source === "manual" && order.manual_ordered_at
                ? order.manual_ordered_at
                : order.created_at,
            items: order.order_items.map(item => ({
                menuItemId: item.menu_item_id, nameKo: item.menu_name_ko, quantity: item.quantity,
            })),
        })));
        if (page.length < PAGE_SIZE) break;
    }

    return aggregateHourlyMenuSales(orders, date);
}
