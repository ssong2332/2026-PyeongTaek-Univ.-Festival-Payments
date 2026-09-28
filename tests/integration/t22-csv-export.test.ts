import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";
import { buildOrdersCsv, CSV_HEADERS } from "@/domain/stats/csv";
import { loadCsvOrders } from "@/infra/repositories/csvOrderRepository";

const service = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

test("T-22 exports database item/option snapshots, KST boundaries, refunds, and T-21 sales", async () => {
    const menuId = randomUUID();
    const groupId = randomUUID();
    const optionId = randomUUID();
    const paidId = randomUUID();
    const refundedId = randomUUID();
    const outsideId = randomUUID();
    const itemId = randomUUID();
    const pickupBase = 1_000_000_000 + Math.floor(Math.random() * 500_000_000);
    const range = { from: "2099-03-01", to: "2099-03-01" };

    try {
        const menu = await service.from("menu_items").insert({ id: menuId, base_price: 3000, stock: 10 });
        if (menu.error) throw menu.error;
        const group = await service.from("option_groups").insert({ id: groupId, menu_item_id: menuId });
        if (group.error) throw group.error;
        const option = await service.from("options").insert({ id: optionId, option_group_id: groupId, extra_price: 500 });
        if (option.error) throw option.error;

        const orders = await service.from("orders").insert([
            { id: paidId, pickup_number: pickupBase, status: "paid", payment_method: "cash",
                total_amount: 7000, idempotency_key: randomUUID(), status_token: randomUUID(),
                created_at: "2099-02-28T15:00:00Z", paid_at: "2099-02-28T15:01:00Z" },
            { id: refundedId, pickup_number: pickupBase + 1, status: "refunded", payment_method: "cash",
                total_amount: 3500, idempotency_key: randomUUID(), status_token: randomUUID(),
                created_at: "2099-03-01T14:59:59Z" },
            { id: outsideId, pickup_number: pickupBase + 2, status: "paid", payment_method: "cash",
                total_amount: 3500, idempotency_key: randomUUID(), status_token: randomUUID(),
                created_at: "2099-03-01T15:00:00Z" },
        ]);
        if (orders.error) throw orders.error;

        const items = await service.from("order_items").insert([
            { id: itemId, order_id: paidId, menu_item_id: menuId, menu_name_ko: "기본호떡",
                unit_price: 3000, options_price: 500, quantity: 2, line_total: 7000 },
            { id: randomUUID(), order_id: refundedId, menu_item_id: menuId, menu_name_ko: "기본호떡",
                unit_price: 3000, options_price: 500, quantity: 1, line_total: 3500 },
            { id: randomUUID(), order_id: outsideId, menu_item_id: menuId, menu_name_ko: "기본호떡",
                unit_price: 3000, options_price: 500, quantity: 1, line_total: 3500 },
        ]);
        if (items.error) throw items.error;
        const snapshot = await service.from("order_item_options").insert({
            order_item_id: itemId, option_id: optionId, option_group_name_ko: "토핑",
            option_name_ko: "견과류", extra_price: 500,
        });
        if (snapshot.error) throw snapshot.error;
        const history = await service.from("order_status_history").insert({
            order_id: refundedId, from_status: "paid", to_status: "refunded",
            action: "refund", actor_type: "admin", reason: "고객 요청",
        });
        if (history.error) throw history.error;

        const changedMenu = await service.from("menu_items").update({ base_price: 4000 }).eq("id", menuId);
        if (changedMenu.error) throw changedMenu.error;
        const changedOption = await service.from("options").update({ extra_price: 1000 }).eq("id", optionId);
        if (changedOption.error) throw changedOption.error;

        const loaded = await loadCsvOrders(service, range);
        expect(loaded.map(order => order.id)).toEqual([paidId, refundedId]);
        expect(loaded[0].items[0]).toMatchObject({
            menuNameKo: "기본호떡", options: ["견과류"], quantity: 2, lineTotal: 7000,
        });
        expect(loaded[1].reason).toBe("고객 요청");

        const csv = buildOrdersCsv(loaded, range);
        expect(csv.rowCount).toBe(2);
        expect(csv.sales).toBe(7000);
        expect(csv.content).toContain("2099-03-01 00:00:00,기본호떡,견과류,2,7000,현금,결제확인");
        expect(csv.content).toContain("환불,고객 요청");
        const stats = await service.rpc("get_stats", { p_date: range.from });
        expect(stats.error).toBeNull();
        expect(stats.data.sales).toBe(csv.sales);

        const emptyRange = { from: "2099-03-03", to: "2099-03-03" };
        const empty = buildOrdersCsv(await loadCsvOrders(service, emptyRange), emptyRange);
        expect(empty).toMatchObject({ sales: 0, rowCount: 0 });
        expect(empty.content).toBe(`\uFEFF${CSV_HEADERS.join(",")}\r\n`);
    } finally {
        const removedOrders = await service.from("orders").delete().in("id", [paidId, refundedId, outsideId]);
        if (removedOrders.error) throw removedOrders.error;
        const removedMenu = await service.from("menu_items").delete().eq("id", menuId);
        if (removedMenu.error) throw removedMenu.error;
    }
}, 30_000);
