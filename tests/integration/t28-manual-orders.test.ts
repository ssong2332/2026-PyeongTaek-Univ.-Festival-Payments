import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, test } from "vitest";
import { buildOrdersCsv } from "@/domain/stats/csv";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { loadCsvOrders } from "@/infra/repositories/csvOrderRepository";
import { createSupabaseManualOrderRepository } from "@/infra/repositories/supabaseManualOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import type { ManualOrderRequest } from "@/lib/dto/manualOrder";
import { getAdminOrderById } from "@/services/adminOrderService";
import { createManualOrder } from "@/services/manualOrderService";

// T-28 수기 주문 사후 입력(F-34, DECISIONS #62): POST /api/admin/manual-orders가 쓰는 조합
// (createManualOrder → SupabaseManualOrderRepository → DB 함수 create_manual_order)을 실제 DB에 연결한다.
// 통합 테스트에는 동작을 바꾸는 mock을 쓰지 않는다(DECISIONS #46) — 관리자 인증·본문 검증은
// tests/unit/api/adminManualOrdersRoute.test.ts가 맡는다.
const db = createServiceClient();
const manualOrderRepository = createSupabaseManualOrderRepository(db);
const orderRepository = createSupabaseOrderRepository(db);
const adminId = randomUUID();
const createdMenus: string[] = [];
const usedKeys: string[] = [];

const PICKUP_BASE = 2_100_000_000;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

// 테스트마다 다른 수기 번호를 쓴다(끝나면 주문을 지우므로 다음 실행에서 다시 쓸 수 있다).
let nextNumber = 7000;
const freshNumber = () => nextNumber++;

async function must<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw error;
    return data as T;
}

type Menu = { id: string; optionId: string; otherOptionId: string };

// 메뉴 1개(가격 3,000원) + 옵션 그룹 1개(0~1개 선택) + 옵션 2개(각 500원).
async function createMenu(overrides: {
    stock?: number; isActive?: boolean; isSoldOutManual?: boolean; optionActive?: boolean;
} = {}): Promise<Menu> {
    const menu = await must<{ id: string }>(db.from("menu_items").insert({
        base_price: 3000,
        stock: overrides.stock ?? 10,
        is_active: overrides.isActive ?? true,
        is_sold_out_manual: overrides.isSoldOutManual ?? false,
    }).select("id").single());
    createdMenus.push(menu.id);
    await must(db.from("menu_item_translations").insert({ menu_item_id: menu.id, locale: "ko", name: "수기 테스트 호떡" }));

    const group = await must<{ id: string }>(db.from("option_groups")
        .insert({ menu_item_id: menu.id, min_select: 0, max_select: 1 }).select("id").single());
    await must(db.from("option_group_translations").insert({ option_group_id: group.id, locale: "ko", name: "시즈닝" }));
    const options = await must<{ id: string; sort_order: number }[]>(db.from("options").insert([
        { option_group_id: group.id, extra_price: 500, sort_order: 0, is_active: overrides.optionActive ?? true },
        { option_group_id: group.id, extra_price: 500, sort_order: 1, is_active: true },
    ]).select("id, sort_order").order("sort_order"));
    await must(db.from("option_translations").insert([
        { option_id: options[0].id, locale: "ko", name: "허니버터" },
        { option_id: options[1].id, locale: "ko", name: "콘소메" },
    ]));
    return { id: menu.id, optionId: options[0].id, otherOptionId: options[1].id };
}

function request(menu: Menu, overrides: Partial<ManualOrderRequest> = {}): ManualOrderRequest {
    const idempotencyKey = overrides.idempotencyKey ?? randomUUID();
    usedKeys.push(idempotencyKey);
    return {
        idempotencyKey,
        paymentMethod: "cash",
        manualOrderedAt: minutesAgo(30),
        manualNumber: freshNumber(),
        items: [{ menuItemId: menu.id, quantity: 2, optionIds: [] }],
        ...overrides,
    };
}

const save = (input: ManualOrderRequest) => createManualOrder(input, { manualOrderRepository, adminId });

async function stock(menuId: string) {
    return (await must<{ stock: number }>(db.from("menu_items").select("stock").eq("id", menuId).single())).stock;
}

async function ordersOf(menuId: string) {
    const lines = await must<{ order_id: string }[]>(db.from("order_items").select("order_id").eq("menu_item_id", menuId));
    return [...new Set(lines.map((line) => line.order_id))];
}

async function rejection(promise: Promise<unknown>) {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    return { code: (error as AppError).code, status: (error as AppError).status };
}

async function pickupCounter() {
    const row = await must<{ value: number } | null>(db.from("counters").select("value").eq("key", "pickup_number").maybeSingle());
    return row?.value ?? null;
}

afterEach(async () => {
    // order_items.menu_item_id가 ON DELETE RESTRICT라 주문을 먼저 지운다(항목·이력은 CASCADE).
    if (usedKeys.length) await must(db.from("orders").delete().in("idempotency_key", usedKeys.splice(0)));
    if (createdMenus.length) await must(db.from("menu_items").delete().in("id", createdMenus.splice(0)));
});

describe("T-28 수기 주문 저장", () => {
    test.each(["cash", "transfer"] as const)(
        "%s 수기 주문은 완료 상태로 저장되고 재고·이력·가격이 한 번에 기록된다",
        async (paymentMethod) => {
            const menu = await createMenu({ stock: 10 });
            const input = request(menu, {
                paymentMethod,
                items: [{ menuItemId: menu.id, quantity: 2, optionIds: [menu.optionId] }],
            });

            const result = await save(input);

            expect(result).toMatchObject({
                manualNumber: input.manualNumber,
                displayNumber: `M-${input.manualNumber}`,
                status: "completed",
                paymentMethod,
                totalAmount: (3000 + 500) * 2,
                manualOrderedAt: input.manualOrderedAt,
                created: true,
                stockShortages: [],
            });

            const order = await must<Record<string, unknown>>(db.from("orders").select("*").eq("id", result.orderId).single());
            expect(order).toMatchObject({
                status: "completed", source: "manual", manual_number: input.manualNumber,
                payment_method: paymentMethod, total_amount: 7000, acknowledged_by: adminId,
                // 고객 픽업 번호와 겹치지 않는 구간
                pickup_number: PICKUP_BASE + input.manualNumber,
            });
            for (const column of ["manual_ordered_at", "paid_at", "completed_at"]) {
                expect(new Date(order[column] as string).toISOString()).toBe(input.manualOrderedAt);
            }
            expect(order.acknowledged_at).not.toBeNull();
            expect(order.closed_at).toBeNull();

            const items = await must<Record<string, unknown>[]>(db.from("order_items")
                .select("menu_name_ko, unit_price, options_price, quantity, line_total, order_item_options ( option_name_ko, extra_price )")
                .eq("order_id", result.orderId));
            expect(items).toEqual([{
                menu_name_ko: "수기 테스트 호떡", unit_price: 3000, options_price: 500, quantity: 2, line_total: 7000,
                order_item_options: [{ option_name_ko: "허니버터", extra_price: 500 }],
            }]);

            const history = await must(db.from("order_status_history")
                .select("from_status, to_status, action, actor_type, actor_id, reason").eq("order_id", result.orderId));
            expect(history).toEqual([{
                from_status: null, to_status: "completed", action: "manual_create",
                actor_type: "admin", actor_id: adminId, reason: null,
            }]);
            expect(await stock(menu.id)).toBe(8);
        },
    );

    test("판매 종료(비활성)·수동 품절 메뉴와 판매 중지된 옵션도 저장한다 — 종이 주문은 이미 판 것이다", async () => {
        const inactive = await createMenu({ isActive: false, optionActive: false });
        const soldOut = await createMenu({ isSoldOutManual: true });

        const result = await save(request(inactive, {
            items: [
                { menuItemId: inactive.id, quantity: 1, optionIds: [inactive.optionId] },
                { menuItemId: soldOut.id, quantity: 1, optionIds: [] },
            ],
        }));

        expect(result).toMatchObject({ created: true, totalAmount: 3500 + 3000 });
        expect(await stock(inactive.id)).toBe(9);
        expect(await stock(soldOut.id)).toBe(9);
    });

    test("가격은 DB 값으로 계산하고, 저장 뒤 메뉴 가격이 바뀌어도 주문 금액은 그대로다", async () => {
        const menu = await createMenu();
        const input = request(menu);
        const first = await save(input);
        await must(db.from("menu_items").update({ base_price: 9000 }).eq("id", menu.id));

        const replay = await save(input);

        expect(first.totalAmount).toBe(6000);
        expect(replay).toMatchObject({ orderId: first.orderId, totalAmount: 6000, created: false });
    });
});

describe("T-28 멱등 재요청", () => {
    test("같은 멱등키로 다시 보내면 같은 주문을 돌려주고 주문·재고·이력은 1건뿐이다", async () => {
        const menu = await createMenu({ stock: 10 });
        const input = request(menu);

        const first = await save(input);
        const second = await save(input);
        const third = await save({ ...input, items: [{ menuItemId: menu.id, quantity: 5, optionIds: [] }] });

        expect(first.created).toBe(true);
        for (const replay of [second, third]) {
            expect(replay).toEqual({ ...first, created: false, stockShortages: [] });
        }
        expect(await ordersOf(menu.id)).toEqual([first.orderId]);
        expect(await stock(menu.id)).toBe(8);
        expect(await must(db.from("order_status_history").select("id").eq("order_id", first.orderId))).toHaveLength(1);
    });

    test("같은 멱등키 요청이 동시에 5번 와도 주문은 1건, 재고는 한 번만 줄어든다", async () => {
        const menu = await createMenu({ stock: 10 });
        const input = request(menu);

        const results = await Promise.all(Array.from({ length: 5 }, () => save(input)));

        expect(results.filter((result) => result.created)).toHaveLength(1);
        expect(new Set(results.map((result) => result.orderId)).size).toBe(1);
        expect(await ordersOf(menu.id)).toHaveLength(1);
        expect(await stock(menu.id)).toBe(8);
    });

    test("고객 주문에 쓰인 멱등키로는 수기 주문을 만들 수 없다(400) — 고객 주문은 그대로", async () => {
        const menu = await createMenu({ stock: 10 });
        const key = randomUUID();
        usedKeys.push(key);
        const customer = await orderRepository.createOrder({
            idempotencyKey: key, paymentMethod: "cash", locale: "ko",
            items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });

        expect(await rejection(save(request(menu, { idempotencyKey: key }))))
            .toEqual({ code: "VALIDATION_ERROR", status: 400 });
        const order = await must<Record<string, unknown>>(db.from("orders").select("status, source").eq("id", customer.orderId).single());
        expect(order).toEqual({ status: "pending", source: "customer" });
        expect(await stock(menu.id)).toBe(9);
    });
});

describe("T-28 재고", () => {
    test("재고가 모자라도 저장하고 재고는 0에서 멈춘다 — 부족 내역을 응답으로 알려 준다", async () => {
        const menu = await createMenu({ stock: 1 });

        const result = await save(request(menu, { items: [{ menuItemId: menu.id, quantity: 3, optionIds: [] }] }));

        expect(result).toMatchObject({
            created: true, totalAmount: 9000,
            stockShortages: [{ menuItemId: menu.id, requested: 3, available: 1 }],
        });
        expect(await stock(menu.id)).toBe(0);
    });

    test("재고 0인 메뉴도 저장하고 재고는 0 그대로다(음수 금지)", async () => {
        const menu = await createMenu({ stock: 0 });

        const result = await save(request(menu));

        expect(result.stockShortages).toEqual([{ menuItemId: menu.id, requested: 2, available: 0 }]);
        expect(await stock(menu.id)).toBe(0);
    });

    test("같은 메뉴가 여러 줄이면 합계 수량으로 한 번만 차감한다", async () => {
        const menu = await createMenu({ stock: 10 });

        await save(request(menu, {
            items: [
                { menuItemId: menu.id, quantity: 2, optionIds: [] },
                { menuItemId: menu.id, quantity: 3, optionIds: [menu.optionId] },
            ],
        }));

        expect(await stock(menu.id)).toBe(5);
    });
});

describe("T-28 수기 번호(M-)", () => {
    test("이미 입력한 수기 번호를 다른 요청으로 다시 쓰면 409 — 주문·재고가 늘지 않는다", async () => {
        const menu = await createMenu({ stock: 10 });
        const first = await save(request(menu));

        expect(await rejection(save(request(menu, { manualNumber: first.manualNumber }))))
            .toEqual({ code: "MANUAL_NUMBER_TAKEN", status: 409 });
        expect(await ordersOf(menu.id)).toEqual([first.orderId]);
        expect(await stock(menu.id)).toBe(8);
    });

    test("같은 수기 번호의 서로 다른 요청이 동시에 오면 하나만 저장된다", async () => {
        const menu = await createMenu({ stock: 10 });
        const manualNumber = freshNumber();

        const results = await Promise.allSettled(
            Array.from({ length: 4 }, () => save(request(menu, { manualNumber }))),
        );

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        for (const result of results) {
            if (result.status === "rejected") {
                expect(result.reason).toMatchObject({ code: "MANUAL_NUMBER_TAKEN", status: 409 });
            }
        }
        expect(await ordersOf(menu.id)).toHaveLength(1);
        expect(await stock(menu.id)).toBe(8);
    });

    test("수기 주문은 고객 픽업 번호 카운터를 쓰지 않는다 — 다음 고객 주문 번호가 그대로 이어진다", async () => {
        const menu = await createMenu({ stock: 10 });
        const key = randomUUID();
        usedKeys.push(key);
        const before = await orderRepository.createOrder({
            idempotencyKey: key, paymentMethod: "cash", locale: "ko",
            items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });
        const counter = await pickupCounter();

        await save(request(menu));

        expect(await pickupCounter()).toBe(counter);
        const nextKey = randomUUID();
        usedKeys.push(nextKey);
        const next = await orderRepository.createOrder({
            idempotencyKey: nextKey, paymentMethod: "cash", locale: "ko",
            items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });
        expect(next.pickupNumber).toBe(before.pickupNumber + 1);
    });
});

describe("T-28 거부되는 입력", () => {
    test("없는 메뉴는 409 MENU_UNAVAILABLE — 아무것도 저장되지 않는다", async () => {
        const menu = await createMenu({ stock: 10 });
        const input = request(menu, {
            items: [
                { menuItemId: menu.id, quantity: 1, optionIds: [] },
                { menuItemId: randomUUID(), quantity: 1, optionIds: [] },
            ],
        });

        expect(await rejection(save(input))).toEqual({ code: "MENU_UNAVAILABLE", status: 409 });
        expect(await ordersOf(menu.id)).toEqual([]);
        expect(await stock(menu.id)).toBe(10);
    });

    test("다른 메뉴의 옵션·중복 옵션·그룹 최대 선택 초과는 409 INVALID_OPTION", async () => {
        const menu = await createMenu();
        const other = await createMenu();
        const cases = [[other.optionId], [menu.optionId, menu.optionId], [menu.optionId, menu.otherOptionId]];

        for (const optionIds of cases) {
            expect(await rejection(save(request(menu, { items: [{ menuItemId: menu.id, quantity: 1, optionIds }] }))))
                .toEqual({ code: "INVALID_OPTION", status: 409 });
        }
        expect(await ordersOf(menu.id)).toEqual([]);
        expect(await stock(menu.id)).toBe(10);
    });

    test("미래의 종이 주문 시각은 서비스와 DB 함수 모두 400으로 막는다", async () => {
        const menu = await createMenu();
        const future = new Date(Date.now() + 3_600_000).toISOString();

        expect(await rejection(save(request(menu, { manualOrderedAt: future }))))
            .toEqual({ code: "VALIDATION_ERROR", status: 400 });
        const input = request(menu, { manualOrderedAt: future });
        expect(await rejection(manualOrderRepository.createManualOrder({ ...input, actorId: adminId })))
            .toEqual({ code: "VALIDATION_ERROR", status: 400 });
        expect(await ordersOf(menu.id)).toEqual([]);
    });

    test("범위 밖 수기 번호는 DB 함수가 400으로 막는다", async () => {
        const menu = await createMenu();

        for (const manualNumber of [0, 10_000]) {
            const input = request(menu, { manualNumber });
            expect(await rejection(manualOrderRepository.createManualOrder({ ...input, actorId: adminId })))
                .toEqual({ code: "VALIDATION_ERROR", status: 400 });
        }
        expect(await ordersOf(menu.id)).toEqual([]);
    });

    test("anon·authenticated 역할은 DB 함수를 실행할 수 없다", async () => {
        const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        const menu = await createMenu();

        const { error } = await anon.rpc("create_manual_order", {
            p_idempotency_key: randomUUID(), p_payment_method: "cash", p_manual_ordered_at: minutesAgo(10),
            p_manual_number: freshNumber(), p_actor_id: adminId,
            p_items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });

        expect(error).not.toBeNull();
        expect(await ordersOf(menu.id)).toEqual([]);
    });
});

describe("T-28 매출·통계·CSV 날짜는 종이 주문 시각 기준(DECISIONS #62)", () => {
    // 다른 테스트 데이터와 섞이지 않게 아무 주문도 없는 과거 날짜를 쓴다. 2001-01-05 KST = 01-04T15:00Z ~ 01-05T15:00Z.
    const PAPER_DAY = "2001-01-05";
    const stats = async (date: string) =>
        must<{ sales: number; orderCount: number; totals: { completed: number } }>(db.rpc("get_stats", { p_date: date }));

    test("과거 날짜의 종이 주문을 오늘 입력하면 그 날짜 매출로 잡히고 오늘 매출은 늘지 않는다", async () => {
        const menu = await createMenu();
        const todayBefore = await stats(kstToday());

        const result = await save(request(menu, { manualOrderedAt: "2001-01-05T03:00:00.000Z" }));

        expect(await stats(PAPER_DAY)).toMatchObject({ sales: 6000, orderCount: 1, totals: { completed: 1 } });
        const todayAfter = await stats(kstToday());
        expect(todayAfter.sales).toBe(todayBefore.sales);
        expect(todayAfter.orderCount).toBe(todayBefore.orderCount);
        // 입력 시각(created_at)은 오늘이다 — 날짜 기준만 종이 시각이다.
        const order = await must<{ created_at: string }>(db.from("orders").select("created_at").eq("id", result.orderId).single());
        expect(Date.now() - Date.parse(order.created_at)).toBeLessThan(60_000);
    });

    test("KST 자정 경계: 15:00Z(=다음 날 00:00 KST)는 다음 날 매출이다", async () => {
        const menu = await createMenu();

        await save(request(menu, { manualOrderedAt: "2001-01-05T14:59:59.000Z" }));
        await save(request(menu, { manualOrderedAt: "2001-01-05T15:00:00.000Z" }));

        expect(await stats("2001-01-05")).toMatchObject({ sales: 6000, orderCount: 1 });
        expect(await stats("2001-01-06")).toMatchObject({ sales: 6000, orderCount: 1 });
    });

    test("고객 주문은 그대로 생성 시각(created_at) 날짜에 잡힌다", async () => {
        const menu = await createMenu();
        const key = randomUUID();
        usedKeys.push(key);
        const before = await stats(kstToday());
        const customer = await orderRepository.createOrder({
            idempotencyKey: key, paymentMethod: "cash", locale: "ko",
            items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });
        await orderRepository.transition({
            orderId: customer.orderId, from: "pending", to: "cooking", action: "confirm_cash",
            actorType: "admin", actorId: adminId, reason: null, refundChannel: null,
        });

        const after = await stats(kstToday());

        expect(after.sales).toBe(before.sales + 3000);
        expect(after.orderCount).toBe(before.orderCount + 1);
    });

    test("CSV도 종이 주문 날짜 범위에 들어가고 번호는 M- 형식, 주문 시각은 종이 시각이다", async () => {
        const menu = await createMenu();
        const result = await save(request(menu, { paymentMethod: "transfer", manualOrderedAt: "2001-01-05T03:00:00.000Z" }));
        const range = { from: PAPER_DAY, to: PAPER_DAY };

        const paperDay = await loadCsvOrders(db, range);
        const today = await loadCsvOrders(db, { from: kstToday(), to: kstToday() });

        expect(paperDay.map((order) => order.id)).toEqual([result.orderId]);
        expect(paperDay[0]).toMatchObject({
            manualNumber: result.manualNumber, createdAt: expect.stringContaining("2001-01-05T03:00:00"),
            status: "completed", totalAmount: 6000,
        });
        expect(today.map((order) => order.id)).not.toContain(result.orderId);

        const csv = buildOrdersCsv(paperDay, range);
        expect(csv.sales).toBe(6000);
        expect(csv.content).toContain(`${result.orderId},${result.displayNumber},2001-01-05 12:00:00,수기 테스트 호떡`);
        expect(csv.content).toContain("계좌이체,완료");
    });

    test("관리자 주문 조회는 수기 주문의 출처·번호·종이 시각을 돌려준다(고객 주문은 customer)", async () => {
        const menu = await createMenu();
        const input = request(menu);
        const manual = await save(input);
        const key = randomUUID();
        usedKeys.push(key);
        const customer = await orderRepository.createOrder({
            idempotencyKey: key, paymentMethod: "cash", locale: "ko",
            items: [{ menuItemId: menu.id, quantity: 1, optionIds: [] }],
        });
        const admin = new SupabaseAdminOrderRepository(db);

        expect(await getAdminOrderById(admin, manual.orderId)).toMatchObject({
            status: "completed", source: "manual", manualNumber: input.manualNumber,
            pickupNumber: PICKUP_BASE + input.manualNumber, availableActions: [],
        });
        expect(Date.parse((await getAdminOrderById(admin, manual.orderId)).manualOrderedAt as string))
            .toBe(Date.parse(input.manualOrderedAt));
        expect(await getAdminOrderById(admin, customer.orderId)).toMatchObject({
            source: "customer", manualNumber: null, manualOrderedAt: null,
        });
    });
});
