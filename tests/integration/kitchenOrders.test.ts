import { randomInt, randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { kstDate, kstDayUtcRange } from "@/domain/time/kst";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { listAdminOrders, listKitchenOrders, transition } from "@/services/adminOrderService";

// 조리 화면(GET /api/admin/orders?scope=kitchen)과 같은 조합을 실제 DB로 돌린다.
// 관리자 인증·scope·limit 검증은 tests/unit/api/adminOrdersRoute.test.ts가 맡는다.
const db = createServiceClient();
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const orderRepository = createSupabaseOrderRepository(db);
const createdOrders: string[] = [];

// 오늘(KST) 0시 5분 전 — 어제 자정 직전에 들어온 주문
const todayStart = kstDayUtcRange(kstDate(new Date().toISOString())).start;
const beforeMidnight = new Date(Date.parse(todayStart) - 5 * 60_000).toISOString();

interface OrderSeed { status: string; createdAt: string; cookingStartedAt?: string | null }

function row({ status, createdAt, cookingStartedAt = null }: OrderSeed) {
    return {
        pickup_number: randomInt(100_000, 2_000_000_000),
        status,
        payment_method: "cash",
        total_amount: 0,
        idempotency_key: randomUUID(),
        status_token: randomUUID(),
        created_at: createdAt,
        cooking_started_at: cookingStartedAt,
    };
}

async function createOrders(seeds: OrderSeed[]) {
    const { data, error } = await db.from("orders").insert(seeds.map(row)).select("id");
    if (error) throw error;
    const created = (data as { id: string }[]).map((item) => item.id);
    createdOrders.push(...created);
    return created;
}

const ids = (orders: { id: string }[]) => orders.map((order) => order.id);

afterEach(async () => {
    const all = createdOrders.splice(0);
    for (let i = 0; i < all.length; i += 100) await db.from("orders").delete().in("id", all.slice(i, i + 100));
});

test("자정 전에 들어와 자정 뒤에도 조리중인 주문은 조리 화면에 나오고, 완료하면 빠진다", async () => {
    const [lateCooking, todayCooking] = await createOrders([
        { status: "cooking", createdAt: beforeMidnight, cookingStartedAt: beforeMidnight },
        { status: "cooking", createdAt: new Date().toISOString(), cookingStartedAt: new Date().toISOString() },
    ]);
    const finished = await createOrders(["completed", "refunded", "cancelled", "paid"].map((status) => ({ status, createdAt: beforeMidnight })));

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

test("조리중 201건: 상한에 걸려도 가장 오래 기다린 주문은 빠지지 않고, 전체 건수로 남은 주문을 알린다", async () => {
    // 아주 오래전 시각으로 만들어 다른 조리중 주문보다 앞서게 한다.
    const base = Date.parse("2020-01-01T00:00:00.000Z");
    const at = (seconds: number) => new Date(base + seconds * 1000).toISOString();
    // 생성 순서와 조리 시작 순서를 거꾸로: i번째는 늦게 만들어졌을수록 먼저 조리를 시작했다.
    const seeds = Array.from({ length: 201 }, (_, i) => ({ status: "cooking", createdAt: at(10_000 + i), cookingStartedAt: at(20_000 - i) }));
    const created = await createOrders(seeds);
    // 조리 시작 순서(가장 오래 기다린 주문부터) = 생성의 역순
    const byCookingStart = [...created].reverse();
    const longestWaiting = byCookingStart[0];
    const newestCooking = byCookingStart[200];

    const first = await listKitchenOrders(adminOrderRepository, 200);
    const firstIds = ids(first.orders);
    expect(firstIds).toHaveLength(200);
    expect(first.total).toBeGreaterThanOrEqual(201);
    // 생성 시각으로 잘랐다면 빠졌을 주문(가장 늦게 생성 = 가장 먼저 조리 시작)이 들어 있다.
    expect(firstIds).toContain(longestWaiting);
    // 이번 조리중 주문은 조리 시작 순서 그대로, 빠진 것이 있다면 맨 뒤(가장 최근에 조리 시작)부터다.
    const mine = firstIds.filter((id) => created.includes(id));
    expect(mine).toEqual(byCookingStart.slice(0, mine.length));
    expect(firstIds).not.toContain(newestCooking);

    // 더 불러오면 남은 주문까지 모두 나온다.
    const more = ids((await listKitchenOrders(adminOrderRepository, 400)).orders);
    for (const id of created) expect(more).toContain(id);
});
