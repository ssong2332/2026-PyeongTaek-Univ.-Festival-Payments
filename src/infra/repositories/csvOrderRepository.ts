import type { SupabaseClient } from "@supabase/supabase-js";
import type { CsvDateRange, CsvOrder } from "@/domain/stats/csv";
import { kstDayUtcRange } from "@/domain/stats/aggregate";
import { AppError } from "@/lib/api/errors";

interface DbOrderItemOption {
    id: string;
    option_name_ko: string;
}

interface DbOrderItem {
    id: string;
    sort_order: number;
    menu_name_ko: string;
    quantity: number;
    line_total: number;
    order_item_options: DbOrderItemOption[];
}

interface DbStatusHistory {
    id: number;
    to_status: CsvOrder["status"];
    reason: string | null;
}

interface DbOrder {
    id: string;
    pickup_number: number;
    created_at: string;
    payment_method: CsvOrder["paymentMethod"];
    status: CsvOrder["status"];
    total_amount: number;
    paid_at: string | null;
    completed_at: string | null;
    order_items: DbOrderItem[];
    order_status_history: DbStatusHistory[];
}

const PAGE_SIZE = 500;
const ORDER_SELECT = `
    id, pickup_number, created_at, payment_method, status, total_amount, paid_at, completed_at,
    order_items ( id, sort_order, menu_name_ko, quantity, line_total,
        order_item_options ( id, option_name_ko ) ),
    order_status_history ( id, to_status, reason )
`;

function toCsvOrder(row: DbOrder): CsvOrder {
    const reason = row.order_status_history
        .filter(history => history.to_status === row.status)
        .toSorted((a, b) => b.id - a.id)[0]?.reason ?? null;

    return {
        id: row.id,
        pickupNumber: row.pickup_number,
        createdAt: row.created_at,
        paymentMethod: row.payment_method,
        status: row.status,
        totalAmount: row.total_amount,
        reason,
        paidAt: row.paid_at,
        completedAt: row.completed_at,
        items: row.order_items
            .toSorted((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
            .map(item => ({
                menuNameKo: item.menu_name_ko,
                options: item.order_item_options
                    .toSorted((a, b) => a.id.localeCompare(b.id))
                    .map(option => option.option_name_ko),
                quantity: item.quantity,
                lineTotal: item.line_total,
            })),
    };
}

/** Uses the order-time snapshots, so later menu and option edits cannot change an export. */
export async function loadCsvOrders(client: SupabaseClient, range: CsvDateRange): Promise<CsvOrder[]> {
    const start = kstDayUtcRange(range.from).start;
    const end = kstDayUtcRange(range.to).end;
    if (start >= end) throw new RangeError("from must not be after to");

    const orders: CsvOrder[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await client.from("orders")
            .select(ORDER_SELECT)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new AppError("INTERNAL_ERROR", 500);
        const page = (data ?? []) as unknown as DbOrder[];
        orders.push(...page.map(toCsvOrder));
        if (page.length < PAGE_SIZE) break;
    }
    return orders;
}
