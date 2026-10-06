import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { formatManualNumber } from "@/domain/order/manualNumber";
import { buildOrdersCsv } from "@/domain/stats/csv";
import { loadCsvOrders } from "@/infra/repositories/csvOrderRepository";
import { createSupabaseReportRepository } from "@/infra/repositories/supabaseReportRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { getOperationsReport } from "@/services/reportService";

// T-47: getOperationsReport → supabaseReportRepository(get_stats RPC + 후기 조회)를 실제 DB에 연결한다.
// 관리자 인증·쿼리 검증은 tests/unit/api/adminReportRoute.test.ts가 맡는다(동작을 바꾸는 mock 금지 — DECISIONS #46).
const db = createServiceClient();
const range = { from: "2099-05-01", to: "2099-05-02" };

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw error;
    return data as T;
}

test("T-47 report reuses get_stats per day, matches the CSV total, and lists in-range reviews", async () => {
    const repository = createSupabaseReportRepository(db);
    const menuId = randomUUID();
    const ids = { paid: randomUUID(), refunded: randomUUID(), cancelled: randomUUID(), expired: randomUUID(),
        completed: randomUUID(), manual: randomUUID(), outside: randomUUID() };
    const pickupBase = randomInt(1_000_000_000, 1_500_000_000);
    const manualNumber = randomInt(9000, 10_000);

    // 사전조건: 이 기간에 다른 실행의 주문이 남아 있으면 비교가 틀어지므로 여기서 바로 실패한다.
    const before = await getOperationsReport(range, repository);
    expect(before).toMatchObject({ isEmpty: true, total: { sales: 0 }, reviews: { count: 0, averageRating: null } });

    try {
        await must(db.from("menu_items").insert({ id: menuId, base_price: 3000, stock: 10 }));
        const order = (id: string, offset: number, status: string, createdAt: string, quantity: number) => ({
            id, pickup_number: pickupBase + offset, status, payment_method: "cash", total_amount: 3000 * quantity,
            idempotency_key: randomUUID(), status_token: randomUUID(), created_at: createdAt,
        });
        await must(db.from("orders").insert([
            order(ids.paid, 0, "paid", "2099-04-30T15:00:00Z", 2),          // KST 05-01 00:00
            order(ids.refunded, 1, "refunded", "2099-05-01T05:00:00Z", 1),
            order(ids.cancelled, 2, "cancelled", "2099-05-01T06:00:00Z", 1),
            order(ids.expired, 3, "expired", "2099-05-01T07:00:00Z", 1),
            order(ids.completed, 4, "completed", "2099-05-01T15:00:00Z", 3), // KST 05-02 00:00
            order(ids.outside, 5, "completed", "2099-05-02T15:00:00Z", 1),   // KST 05-03 — 범위 밖
        ]));
        // 여러 행 insert는 키 합집합으로 보내 빠진 source가 NULL이 되므로 수기 주문은 따로 넣는다.
        // 05-02에 입력한 05-01 종이 주문 — 매출 날짜는 manual_ordered_at(05-01)
        await must(db.from("orders").insert({
            ...order(ids.manual, 0, "completed", "2099-05-02T03:00:00Z", 1),
            pickup_number: 2_100_000_000 + manualNumber, source: "manual",
            manual_ordered_at: "2099-05-01T03:00:00Z", manual_number: manualNumber,
        }));
        const quantities: [string, number][] = [[ids.paid, 2], [ids.refunded, 1], [ids.cancelled, 1],
            [ids.expired, 1], [ids.completed, 3], [ids.outside, 1], [ids.manual, 1]];
        await must(db.from("order_items").insert(quantities.map(([orderId, quantity]) => ({
            order_id: orderId, menu_item_id: menuId, menu_name_ko: "리포트 호떡",
            unit_price: 3000, options_price: 0, quantity, line_total: 3000 * quantity,
        }))));
        await must(db.from("reviews").insert([
            { order_id: ids.completed, rating: 5, text: "좋아요", created_at: "2099-05-01T16:00:00Z" },
            { order_id: ids.manual, rating: 4, text: null, created_at: "2099-05-02T04:00:00Z" },
            { order_id: ids.outside, rating: 1, text: "범위 밖", created_at: "2099-05-02T16:00:00Z" },
        ]));

        const report = await getOperationsReport(range, repository);

        for (const day of report.days) {
            const stats = await must<{ sales: number }>(db.rpc("get_stats", { p_date: day.date }));
            const dayRange = { from: day.date, to: day.date };
            const csv = buildOrdersCsv(await loadCsvOrders(db, dayRange), dayRange);
            expect(day.sales).toBe(stats.sales);
            expect(day.sales).toBe(csv.sales);
        }
        const csv = buildOrdersCsv(await loadCsvOrders(db, range), range);
        expect(report.total.sales).toBe(csv.sales);

        expect(report.days.map(day => [day.date, day.sales])).toEqual([["2099-05-01", 9000], ["2099-05-02", 9000]]);
        expect(report.isEmpty).toBe(false);
        expect(report.total).toMatchObject({
            sales: 18_000, orderCount: 4, refundedAmount: 3000,
            cancelledCount: 1, refundedCount: 1, expiredCount: 1,
            byMenu: [{ menuItemId: menuId, nameKo: "리포트 호떡", quantity: 6, ratio: 1 }],
        });
        expect(report.reviews).toEqual({
            count: 2,
            averageRating: 4.5,
            items: [
                { displayNumber: String(pickupBase + 4), rating: 5, text: "좋아요", createdAt: "2099-05-01T16:00:00.000Z" },
                { displayNumber: formatManualNumber(manualNumber), rating: 4, text: null, createdAt: "2099-05-02T04:00:00.000Z" },
            ],
        });
    } finally {
        await must(db.from("orders").delete().in("id", Object.values(ids)));
        await must(db.from("menu_items").delete().eq("id", menuId));
    }
}, 30_000);
