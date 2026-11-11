import { randomInt, randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { listAdminOrders, listKitchenOrders, transition } from "@/services/adminOrderService";

// 조리 화면(GET /api/admin/orders?scope=kitchen)과 같은 조합을 실제 DB로 돌린다.
// 관리자 인증·scope 검증은 tests/unit/api/adminOrdersRoute.test.ts가 맡는다.
const db = createServiceClient();
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const orderRepository = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

// 오늘(KST) 0시 5분 전 — 어제 자정 직전에 들어온 주문
const todayStart = kstDayUtcRange(kstDate(new Date().toISOString())).start;
const beforeMidnight = new Date(Date.parse(todayStart) - 5 * 60_000).toISOString();

async function createOrder(status: string, createdAt: string) {
    const { data, error } = await db.from("orders").insert({
        pickup_number: randomInt(100_000, 2_000_000_000),
        status,
        payment_method: "cash",
        total_amount: 0,
        idempotency_key: randomUUID(),
        status_token: randomUUID(),
        created_at: createdAt,
    }).select("id").single();
    if (error) throw error;
    createdOrders.push(data.id);
    return data.id as string;
}

const ids = (orders: { id: string }[]) => orders.map((order) => order.id);

afterEach(async () => {
    if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
});

test("자정 전에 들어와 자정 뒤에도 조리중인 주문은 조리 화면에 나오고, 완료하면 빠진다", async () => {
    const lateCooking = await createOrder("cooking", beforeMidnight);
    const todayCooking = await createOrder("cooking", new Date().toISOString());
    const finished = await Promise.all(["completed", "refunded", "cancelled", "paid"].map((status) => createOrder(status, beforeMidnight)));

    // 기존 관리자 기본값(오늘 KST)은 그대로라 전날 주문은 없다 — 조리 화면만 날짜를 보지 않는다.
    expect(ids((await listAdminOrders(adminOrderRepository)).orders)).not.toContain(lateCooking);

    const kitchen = ids((await listKitchenOrders(adminOrderRepository)).orders);
    expect(kitchen).toContain(lateCooking);
    expect(kitchen).toContain(todayCooking);
    expect(kitchen.indexOf(lateCooking)).toBeLessThan(kitchen.indexOf(todayCooking));
    for (const id of finished) expect(kitchen).not.toContain(id);

    await transition({ orderId: lateCooking, action: "complete", adminId: randomUUID() }, { orderRepository });

    expect(ids((await listKitchenOrders(adminOrderRepository)).orders)).not.toContain(lateCooking);
});
