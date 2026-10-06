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
    manual_number: number | null;
    manual_ordered_at: string | null;
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
    id, pickup_number, manual_number, manual_ordered_at, created_at, payment_method, status, total_amount, paid_at, completed_at,
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
        manualNumber: row.manual_number,
        // 수기 주문(T-28)은 종이에 적힌 주문 시각이 매출 날짜다(DECISIONS #62).
        createdAt: row.manual_ordered_at ?? row.created_at,
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
    const all = range.from === "all" && range.to === "all";
    const start = all ? null : kstDayUtcRange(range.from).start;
    const end = all ? null : kstDayUtcRange(range.to).end;
    if (start !== null && end !== null && start >= end) throw new RangeError("from must not be after to");

    const orders: CsvOrder[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const query = client.from("orders").select(ORDER_SELECT);
        // 날짜 기준: 수기 주문은 manual_ordered_at, 그 밖은 created_at(get_stats 0104와 같은 조건).
        const selected = start === null || end === null ? query : query.or(
            `and(manual_ordered_at.is.null,created_at.gte."${start}",created_at.lt."${end}"),`
            + `and(manual_ordered_at.gte."${start}",manual_ordered_at.lt."${end}")`,
        );
        const { data, error } = await selected
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw new AppError("INTERNAL_ERROR", 500);
        const page = (data ?? []) as unknown as DbOrder[];
        orders.push(...page.map(toCsvOrder));
        if (page.length < PAGE_SIZE) break;
    }
    // DB는 created_at 순으로 페이지를 나눈다. 내보낼 때는 주문 시각(수기는 종이 시각) 순으로 다시 놓는다.
    return orders.toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
}
