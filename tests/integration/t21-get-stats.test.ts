import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const url = process.env.SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(url, process.env.SUPABASE_ANON_KEY!);

test("T-21 DB aggregate applies KST dates, refund rules, menu ratios, and RPC permissions", async () => {
    const menuA = randomUUID();
    const menuB = randomUUID();
    const orderIds = Array.from({ length: 5 }, () => randomUUID());
    const pickupBase = 1_000_000_000 + Math.floor(Math.random() * 500_000_000);
    try {
        const menus = await service.from("menu_items").insert([
            { id: menuA, base_price: 5000, stock: 0 },
            { id: menuB, base_price: 5000, stock: 0 },
        ]);
        if (menus.error) throw menus.error;

        const statuses = ["paid", "completed", "refunded", "pending", "paid"];
        const amounts = [10000, 15000, 5000, 1000, 9000];
        const times = [
            "2099-01-31T15:00:00Z", "2099-02-01T10:00:00Z",
            "2099-02-01T14:59:59Z", "2099-02-01T00:00:00Z",
            "2099-01-31T14:59:59Z",
        ];
        const orders = await service.from("orders").insert(orderIds.map((id, index) => ({
            id, pickup_number: pickupBase + index, status: statuses[index],
            payment_method: "cash", total_amount: amounts[index],
            idempotency_key: randomUUID(), status_token: randomUUID(), created_at: times[index],
        })));
        if (orders.error) throw orders.error;

        const items = await service.from("order_items").insert([
            { order_id: orderIds[0], menu_item_id: menuA, menu_name_ko: "기본호떡",
                unit_price: 5000, quantity: 2, line_total: 10000 },
            { order_id: orderIds[1], menu_item_id: menuB, menu_name_ko: "꿀호떡",
                unit_price: 5000, quantity: 3, line_total: 15000 },
            { order_id: orderIds[2], menu_item_id: menuA, menu_name_ko: "기본호떡",
                unit_price: 5000, quantity: 1, line_total: 5000 },
        ]);
        if (items.error) throw items.error;

        const { data, error } = await service.rpc("get_stats", { p_date: "2099-02-01" });
        expect(error).toBeNull();
        expect(data).toMatchObject({
            date: "2099-02-01", sales: 25000, orderCount: 3,
            refundedAmount: 5000, refundedCount: 1,
            totals: { pending: 1, paid: 1, cooking: 0, completed: 1,
                cancelled: 0, refunded: 1, expired: 0 },
        });
        expect(data.byMenu).toEqual([
            { menuItemId: menuB, nameKo: "꿀호떡", quantity: 3, ratio: 0.6 },
            { menuItemId: menuA, nameKo: "기본호떡", quantity: 2, ratio: 0.4 },
        ]);

        const empty = await service.rpc("get_stats", { p_date: "2099-02-02" });
        expect(empty.error).toBeNull();
        expect(empty.data).toMatchObject({ sales: 0, orderCount: 0, byMenu: [] });
        expect((await service.rpc("get_stats", { p_date: "2099-02-30" })).error).not.toBeNull();
        expect((await anon.rpc("get_stats", { p_date: "2099-02-01" })).error).not.toBeNull();
    } finally {
        const removedOrders = await service.from("orders").delete().in("id", orderIds);
        if (removedOrders.error) throw removedOrders.error;
        const removedMenus = await service.from("menu_items").delete().in("id", [menuA, menuB]);
        if (removedMenus.error) throw removedMenus.error;
    }
}, 30_000);
