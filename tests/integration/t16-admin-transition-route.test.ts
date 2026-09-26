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

afterEach(async () => {
    if (createdOrders.length) await db.from("orders").delete().in("id", createdOrders.splice(0));
    vi.clearAllMocks();
});

test("관리자 상태 변경 API가 실제 DB 전환·이력 기록·주문 DTO 반환까지 연결한다", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: adminId } as never);
    const { data, error } = await db.from("orders").insert({
        pickup_number: randomInt(100_000, 2_000_000_000),
        status: "pending",
        payment_method: "cash",
        total_amount: 0,
        idempotency_key: randomUUID(),
        status_token: randomUUID(),
    }).select("id").single();
    if (error) throw error;
    createdOrders.push(data.id);

    const response = await POST(new NextRequest(`http://localhost/api/admin/orders/${data.id}/transition`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_cash" }),
    }), { params: Promise.resolve({ id: data.id }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        id: data.id, status: "cooking", paymentMethod: "cash",
        availableActions: expect.arrayContaining(["complete"]),
    });
    const { data: order, error: orderError } = await db.from("orders")
        .select("paid_at, cooking_started_at").eq("id", data.id).single();
    if (orderError) throw orderError;
    expect(order.paid_at).not.toBeNull();
    expect(order.paid_at).toBe(order.cooking_started_at);
    const { data: history, error: historyError } = await db.from("order_status_history")
        .select("action, actor_type, actor_id").eq("order_id", data.id).single();
    if (historyError) throw historyError;
    expect(history).toEqual({ action: "confirm_cash", actor_type: "admin", actor_id: adminId });
});
