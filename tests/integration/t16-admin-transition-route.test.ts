import { randomInt, randomUUID } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/infra/supabase/session");

import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/orders/[id]/transition/route";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";

const db = createServiceClient();
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

function requestTransition(id: string, action: string) {
    return POST(new NextRequest(`http://localhost/api/admin/orders/${id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
    }), { params: Promise.resolve({ id }) });
}

afterEach(async () => {
    if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
    vi.clearAllMocks();
});

test("관리자 상태 변경 API가 실제 DB 전환·이력 기록·주문 DTO 반환까지 연결한다", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const id = await createOrder("cash");
    const response = await requestTransition(id, "confirm_cash");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        id, status: "cooking", paymentMethod: "cash",
        availableActions: expect.arrayContaining(["complete"]),
    });
    const { data: order, error: orderError } = await db.from("orders")
        .select("paid_at, cooking_started_at").eq("id", id).single();
    if (orderError) throw orderError;
    expect(order.paid_at).not.toBeNull();
    expect(order.paid_at).toBe(order.cooking_started_at);
    const { data: history, error: historyError } = await db.from("order_status_history")
        .select("action, actor_type, actor_id").eq("order_id", id).single();
    if (historyError) throw historyError;
    expect(history).toEqual({ action: "confirm_cash", actor_type: "admin", actor_id: adminId });
});

test("계좌이체 입금 확인 → 조리 시작 → 완료를 API로 처리하고 이력을 순서대로 남긴다", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const id = await createOrder("transfer");

    const payment = await requestTransition(id, "confirm_payment");
    expect(payment.status).toBe(200);
    expect(await payment.json()).toMatchObject({ id, status: "paid", paymentMethod: "transfer",
        availableActions: expect.arrayContaining(["start_cooking"]) });
    const { data: paid, error: paidError } = await db.from("orders")
        .select("paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (paidError) throw paidError;
    expect(paid.paid_at).not.toBeNull();
    expect(paid.cooking_started_at).toBeNull();

    const cooking = await requestTransition(id, "start_cooking");
    expect(cooking.status).toBe(200);
    expect(await cooking.json()).toMatchObject({ id, status: "cooking",
        availableActions: expect.arrayContaining(["complete"]) });
    const { data: started, error: startedError } = await db.from("orders")
        .select("paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (startedError) throw startedError;
    expect(started.paid_at).toBe(paid.paid_at);
    expect(started.cooking_started_at).not.toBeNull();
    expect(started.completed_at).toBeNull();

    const complete = await requestTransition(id, "complete");
    expect(complete.status).toBe(200);
    expect(await complete.json()).toMatchObject({ id, status: "completed", availableActions: [] });
    const { data: finished, error: finishedError } = await db.from("orders")
        .select("status, paid_at, cooking_started_at, completed_at").eq("id", id).single();
    if (finishedError) throw finishedError;
    expect(finished).toMatchObject({ status: "completed", paid_at: paid.paid_at,
        cooking_started_at: started.cooking_started_at });
    expect(finished.completed_at).not.toBeNull();
    const { data: history, error: historyError } = await db.from("order_status_history")
        .select("from_status, to_status, action, actor_type, actor_id")
        .eq("order_id", id).order("created_at");
    if (historyError) throw historyError;
    expect(history).toEqual([
        { from_status: "pending", to_status: "paid", action: "confirm_payment", actor_type: "admin", actor_id: adminId },
        { from_status: "paid", to_status: "cooking", action: "start_cooking", actor_type: "admin", actor_id: adminId },
        { from_status: "cooking", to_status: "completed", action: "complete", actor_type: "admin", actor_id: adminId },
    ]);
});

test("불허 전환과 동시 중복 요청은 409로 거절하고 서버에는 한 번만 반영한다", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const id = await createOrder("transfer");

    const forbidden = await requestTransition(id, "confirm_cash");
    expect(forbidden.status).toBe(409);
    expect((await forbidden.json()).error.code).toBe("INVALID_TRANSITION");

    const responses = await Promise.all([
        requestTransition(id, "confirm_payment"), requestTransition(id, "confirm_payment"),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const rejected = responses.find(response => response.status === 409)!;
    expect((await rejected.json()).error.code).toMatch(/INVALID_TRANSITION|STATE_CHANGED/);

    const { data: order, error: orderError } = await db.from("orders")
        .select("status, paid_at, cooking_started_at").eq("id", id).single();
    if (orderError) throw orderError;
    expect(order.status).toBe("paid");
    expect(order.paid_at).not.toBeNull();
    expect(order.cooking_started_at).toBeNull();
    const { data: history, error: historyError } = await db.from("order_status_history")
        .select("action").eq("order_id", id);
    if (historyError) throw historyError;
    expect(history).toEqual([{ action: "confirm_payment" }]);
});
