import { randomInt, randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import type { TransitionAction } from "@/domain/order/status";
import { SupabaseAdminOrderRepository } from "@/infra/repositories/adminOrderRepository";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { getAdminOrderById, transition } from "@/services/adminOrderService";

// 관리자 인증(requireAdmin)과 요청 검증은 tests/unit/api/adminOrderTransitionRoute.test.ts가 맡는다.
// 여기서는 Route Handler와 같은 조합(서비스 transition → 실제 저장소 → getAdminOrderById)을
// mock 없이 실제 DB로 돌려 전환·타임스탬프·이력을 확인한다(DECISIONS #46).
const db = createServiceClient();
const orderRepository = createSupabaseOrderRepository(db);
const adminOrderRepository = new SupabaseAdminOrderRepository(db);
const adminId = randomUUID();
const createdOrders: string[] = [];

async function createOrder(paymentMethod: "cash" | "transfer") {
    const { data, error } = await db.from("orders").insert({
        pickup_number: randomInt(100_000, 2_000_000_000),
        status: "pending",
        payment_method: paymentMethod,
        total_amount: 0,
        idempotency_key: randomUUID(),
        status_token: randomUUID(),
    }).select("id").single();
    if (error) throw error;
    createdOrders.push(data.id);
    return data.id as string;
}

function requestTransition(id: string, action: TransitionAction) {
    return transition({ orderId: id, action, adminId }, { orderRepository });
}

async function transitionAndRead(id: string, action: TransitionAction) {
    await requestTransition(id, action);
    return getAdminOrderById(adminOrderRepository, id);
}

async function readHistory(id: string) {
    const { data, error } = await db.from("order_status_history")
        .select("from_status, to_status, action, actor_type, actor_id")
        .eq("order_id", id).order("id");
    if (error) throw error;
    return data;
}

afterEach(async () => {
    if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
});

test("현금 수령 확인은 결제대기 → 조리중으로 바로 바꾸고, 이어서 완료 처리까지 이력을 남긴다", async () => {
    const id = await createOrder("cash");

    expect(await transitionAndRead(id, "confirm_cash")).toMatchObject({
        id, status: "cooking", paymentMethod: "cash",
        availableActions: expect.arrayContaining(["complete"]),
    });
    const { data: cooking, error: cookingError } = await db.from("orders")
        .select("paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (cookingError) throw cookingError;
    expect(cooking.paid_at).not.toBeNull();
    expect(cooking.paid_at).toBe(cooking.cooking_started_at);
    expect(cooking.completed_at).toBeNull();

    expect(await transitionAndRead(id, "complete")).toMatchObject({ id, status: "completed", availableActions: [] });
    const { data: finished, error: finishedError } = await db.from("orders")
        .select("status, paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (finishedError) throw finishedError;
    expect(finished).toMatchObject({ status: "completed", paid_at: cooking.paid_at,
        cooking_started_at: cooking.cooking_started_at });
    expect(finished.completed_at).not.toBeNull();
    expect(await readHistory(id)).toEqual([
        { from_status: "pending", to_status: "cooking", action: "confirm_cash", actor_type: "admin", actor_id: adminId },
        { from_status: "cooking", to_status: "completed", action: "complete", actor_type: "admin", actor_id: adminId },
    ]);
});

test("계좌이체 입금 확인 → 조리 시작 → 완료를 처리하고 이력을 순서대로 남긴다", async () => {
    const id = await createOrder("transfer");

    expect(await transitionAndRead(id, "confirm_payment")).toMatchObject({ id, status: "paid",
        paymentMethod: "transfer", availableActions: expect.arrayContaining(["start_cooking"]) });
    const { data: paid, error: paidError } = await db.from("orders")
        .select("paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (paidError) throw paidError;
    expect(paid.paid_at).not.toBeNull();
    expect(paid.cooking_started_at).toBeNull();

    expect(await transitionAndRead(id, "start_cooking")).toMatchObject({ id, status: "cooking",
        availableActions: expect.arrayContaining(["complete"]) });
    const { data: started, error: startedError } = await db.from("orders")
        .select("paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (startedError) throw startedError;
    expect(started.paid_at).toBe(paid.paid_at);
    expect(started.cooking_started_at).not.toBeNull();
    expect(started.completed_at).toBeNull();

    expect(await transitionAndRead(id, "complete")).toMatchObject({ id, status: "completed", availableActions: [] });
    const { data: finished, error: finishedError } = await db.from("orders")
        .select("status, paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (finishedError) throw finishedError;
    expect(finished).toMatchObject({ status: "completed", paid_at: paid.paid_at,
        cooking_started_at: started.cooking_started_at });
    expect(finished.completed_at).not.toBeNull();
    expect(await readHistory(id)).toEqual([
        { from_status: "pending", to_status: "paid", action: "confirm_payment", actor_type: "admin", actor_id: adminId },
        { from_status: "paid", to_status: "cooking", action: "start_cooking", actor_type: "admin", actor_id: adminId },
        { from_status: "cooking", to_status: "completed", action: "complete", actor_type: "admin", actor_id: adminId },
    ]);
});

test.each([
    { paymentMethod: "cash", forbidden: "confirm_payment", allowed: "confirm_cash", to: "cooking" },
    { paymentMethod: "transfer", forbidden: "confirm_cash", allowed: "confirm_payment", to: "paid" },
] as const)("$paymentMethod 주문: 불허 전환($forbidden)과 동시 중복 요청($allowed)은 409로 거절하고 한 번만 반영한다",
    async ({ paymentMethod, forbidden, allowed, to }) => {
        const id = await createOrder(paymentMethod);

        const forbiddenError = await requestTransition(id, forbidden).catch((error: unknown) => error);
        expect(forbiddenError).toBeInstanceOf(AppError);
        expect(forbiddenError).toMatchObject({ code: "INVALID_TRANSITION", status: 409 });

        const results = await Promise.allSettled([requestTransition(id, allowed), requestTransition(id, allowed)]);
        expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected")!;
        expect(rejected.reason).toBeInstanceOf(AppError);
        expect(rejected.reason).toMatchObject({ status: 409 });
        expect((rejected.reason as AppError).code).toMatch(/^(INVALID_TRANSITION|STATE_CHANGED)$/);

        const { data: order, error: orderError } = await db.from("orders")
            .select("status, paid_at").eq("id", id).single();
        if (orderError) throw orderError;
        expect(order.status).toBe(to);
        expect(order.paid_at).not.toBeNull();
        expect(await readHistory(id)).toEqual([
            { from_status: "pending", to_status: to, action: allowed, actor_type: "admin", actor_id: adminId },
        ]);
    });
