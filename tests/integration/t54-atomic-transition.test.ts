import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";

// setup.ts restricts these tests to CI/local Supabase; no production credentials or mocks.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const rpc = "transition_order_if_cancel_unchanged";
const actorId = randomUUID();
const orders: string[] = [];
const menus: string[] = [];
const requestedAt = "2026-11-12T01:00:00.123Z";
const rejectedAt = "2026-11-12T01:01:00.456Z";
type Marks = { cancel_requested_at: string | null; cancel_rejected_at: string | null };
const empty: Marks = { cancel_requested_at: null, cancel_rejected_at: null };

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
let userId: string | undefined;

async function must<T>(request: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await request;
  if (error) throw error;
  return data as NonNullable<T>;
}

async function fixture(status = "pending", paymentMethod = "transfer", marks: Marks = empty) {
  const menu = await must(db.from("menu_items").insert({ base_price: 3000, stock: 8 }).select("id").single());
  menus.push(menu.id);
  const order = await must(db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000), status, payment_method: paymentMethod,
    total_amount: 6000, idempotency_key: randomUUID(), status_token: randomUUID(), ...marks,
  }).select("id").single());
  orders.push(order.id);
  await must(db.from("order_items").insert({
    order_id: order.id, menu_item_id: menu.id, menu_name_ko: "T-54 fixture",
    unit_price: 3000, quantity: 2, line_total: 6000,
  }));
  return { id: order.id as string, menuId: menu.id as string };
}

function args(id: string, marks: Marks = empty, overrides: Record<string, unknown> = {}) {
  return {
    p_order_id: id, p_from: "pending", p_to: "cooking", p_action: "confirm_payment",
    p_actor_type: "admin", p_actor_id: actorId, p_reason: null, p_refund_channel: null,
    p_expected_cancel_requested_at: marks.cancel_requested_at,
    p_expected_cancel_rejected_at: marks.cancel_rejected_at, ...overrides,
  };
}

async function snapshot(order: { id: string; menuId: string }) {
  return {
    order: await must(db.from("orders").select("*").eq("id", order.id).single()),
    menu: await must(db.from("menu_items").select("stock").eq("id", order.menuId).single()),
    history: await must(db.from("order_status_history").select("from_status,to_status,action,actor_type,actor_id,reason").eq("order_id", order.id)),
  };
}

beforeAll(async () => {
  const email = `t54-${randomUUID()}@example.test`;
  const password = randomUUID();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const signedIn = await authenticated.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
});

afterEach(async () => {
  if (orders.length) await must(db.from("orders").delete().in("id", orders.splice(0)));
  if (menus.length) await must(db.from("menu_items").delete().in("id", menus.splice(0)));
});
afterAll(async () => {
  if (userId) {
    const result = await db.auth.admin.deleteUser(userId);
    if (result.error) throw result.error;
  }
});

describe("T-54 atomic cancellation snapshot guard", () => {
  test.each([
    ["transfer", "pending", "confirm_payment"],
    ["cash", "pending", "confirm_cash"],
    ["transfer", "paid", "start_cooking"],
  ])("%s %s / %s: matching NULL snapshot delegates once, preserves stock", async (payment, status, action) => {
    const order = await fixture(status, payment);
    const { data, error } = await db.rpc(rpc, args(order.id, empty, { p_from: status, p_action: action }));
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: order.id, status: "cooking" });
    const after = await snapshot(order);
    expect(after.menu.stock).toBe(8);
    expect(after.order.cooking_started_at).not.toBeNull();
    if (status === "pending") expect(after.order.paid_at).toBe(after.order.cooking_started_at);
    expect(after.history).toEqual([{
      from_status: status, to_status: "cooking", action, actor_type: "admin", actor_id: actorId, reason: null,
    }]);
  });

  test("matching non-NULL snapshot after rejection permits transition", async () => {
    const marks = { cancel_requested_at: requestedAt, cancel_rejected_at: rejectedAt };
    const order = await fixture("pending", "transfer", marks);
    const { error } = await db.rpc(rpc, args(order.id, marks));
    expect(error).toBeNull();
    expect((await snapshot(order)).order.status).toBe("cooking");
  });

  test.each([
    ["NULL -> requested", empty, { cancel_requested_at: requestedAt, cancel_rejected_at: null }],
    ["requested -> NULL", { cancel_requested_at: requestedAt, cancel_rejected_at: null }, empty],
    ["rejected -> NULL", { cancel_requested_at: requestedAt, cancel_rejected_at: rejectedAt }, { cancel_requested_at: requestedAt, cancel_rejected_at: null }],
    ["rejection changed", { cancel_requested_at: requestedAt, cancel_rejected_at: rejectedAt }, { cancel_requested_at: requestedAt, cancel_rejected_at: requestedAt }],
    ["request changed", { cancel_requested_at: requestedAt, cancel_rejected_at: rejectedAt }, { cancel_requested_at: rejectedAt, cancel_rejected_at: rejectedAt }],
  ] as const)("%s: stale expected marks reject without side effects", async (_name, expected, current) => {
    const order = await fixture("pending", "transfer", current);
    const before = await snapshot(order);
    const { error } = await db.rpc(rpc, args(order.id, expected));
    expect(error?.message).toBe("STATE_CHANGED");
    expect(await snapshot(order)).toEqual(before);
  });

  test("customer first: request saved after admin read rejects the stale NULL snapshot", async () => {
    const order = await fixture();
    expect(await repo.setCancelRequested(order.id)).not.toBeNull();
    const before = await snapshot(order);
    const { error } = await db.rpc(rpc, args(order.id));
    expect(error?.message).toBe("STATE_CHANGED");
    expect(await snapshot(order)).toEqual(before);
  });

  test("admin first: a later conditional customer request cannot enter cooking", async () => {
    const order = await fixture();
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    expect(await repo.setCancelRequested(order.id)).toBeNull();
    const after = await snapshot(order);
    expect(after.order).toMatchObject({ status: "cooking", cancel_requested_at: null });
    expect(after.history).toHaveLength(1);
  });

  test.each(["customer-first dispatch", "admin-first dispatch"])("%s: concurrent HTTP requests never leave cooking with pending cancellation", async (direction) => {
    for (let i = 0; i < 5; i++) {
      const order = await fixture();
      const customer = () => repo.setCancelRequested(order.id);
      const admin = () => db.rpc(rpc, args(order.id)).then((result) => result);
      const pair = direction === "customer-first dispatch"
        ? [customer(), admin()] as const : [admin(), customer()] as const;
      const results = await Promise.all(pair);
      const call = (direction === "customer-first dispatch" ? results[1] : results[0]) as Awaited<ReturnType<typeof admin>>;
      const requested = direction === "customer-first dispatch" ? results[0] : results[1];
      const after = await snapshot(order);
      expect(after.menu.stock).toBe(8);
      if (requested !== null) {
        expect(call.error?.message).toBe("STATE_CHANGED");
        expect(after.order.status).toBe("pending");
        expect(after.history).toEqual([]);
      } else {
        expect(call.error).toBeNull();
        expect(after.order).toMatchObject({ status: "cooking", cancel_requested_at: null });
        expect(after.history).toHaveLength(1);
      }
    }
  });

  test("two admins with the same snapshot produce exactly one history row", async () => {
    const order = await fixture();
    const results = await Promise.all([db.rpc(rpc, args(order.id)), db.rpc(rpc, args(order.id))]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toBe("STATE_CHANGED");
    expect((await snapshot(order)).history).toHaveLength(1);
  });

  test("missing order preserves ORDER_NOT_FOUND", async () => {
    const { error } = await db.rpc(rpc, args(randomUUID()));
    expect(error?.message).toBe("ORDER_NOT_FOUND");
  });

  test("existing terminal protection is delegated unchanged", async () => {
    const order = await fixture("completed");
    const before = await snapshot(order);
    const { error } = await db.rpc(rpc, args(order.id, empty, { p_from: "completed" }));
    expect(error?.message).toBe("TERMINAL_STATE");
    expect(await snapshot(order)).toEqual(before);
  });

  test("inner history failure rolls back the order update too", async () => {
    const order = await fixture();
    const before = await snapshot(order);
    const { error } = await db.rpc(rpc, args(order.id, empty, { p_actor_type: null }));
    expect(error?.code).toBe("23502");
    expect(await snapshot(order)).toEqual(before);
  });

  test.each([["anon", anon], ["authenticated", authenticated]] as const)("%s cannot execute the RPC", async (_role, client) => {
    const order = await fixture();
    const before = await snapshot(order);
    const { error } = await client.rpc(rpc, args(order.id));
    expect(error?.code).toBe("42501");
    expect(error?.message).toContain(`permission denied for function ${rpc}`);
    expect(await snapshot(order)).toEqual(before);
  });
});

