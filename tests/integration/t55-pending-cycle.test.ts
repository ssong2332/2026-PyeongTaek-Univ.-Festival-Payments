import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseOrderRepository } from "@/infra/repositories/supabaseOrderRepository";

// Disposable Supabase only (tests/integration/setup.ts); never target the live project.
const db = createServiceClient();
const repo = createSupabaseOrderRepository(db);
const rpc = "revert_transfer_order_to_pending";
const actorId = randomUUID();
const orders: string[] = [];
const menus: string[] = [];
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, clientOptions);
let userId: string | undefined;
let expireMinutes = 10;

function psqlArgs(): string[] {
  const config = readFileSync("supabase/config.toml", "utf8");
  const projectId = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"\s*$/m.exec(config)?.[1];
  if (!projectId) throw new Error("Disposable Supabase project_id is missing");
  return ["exec", "-i", `supabase_db_${projectId}`, "psql", "-X", "-q", "-t", "-A",
    "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
}

// A separate DB session holds the row lock while the API request starts.
// The marker is emitted after the first statement has acquired that lock.
async function withHeldRow<T>(beforeMarker: string, afterPause: string, duringPause: () => PromiseLike<T>): Promise<T> {
  const child = spawn("docker", psqlArgs(), { stdio: ["pipe", "pipe", "pipe"] });
  let errors = "";
  let marked = false;
  let signalReady!: () => void;
  let signalFailure!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { signalReady = resolve; signalFailure = reject; });
  const done = new Promise<{ code: number | null }>((resolve) => {
    child.on("close", (code) => {
      if (!marked) signalFailure(new Error(`Held DB session exited before lock marker: ${errors}`));
      resolve({ code });
    });
    child.on("error", (error) => signalFailure(error));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    errors += chunk.toString();
    if (!marked && errors.includes("T55_ROW_LOCKED")) { marked = true; signalReady(); }
  });
  child.stdin.end([
    "BEGIN;", "SET LOCAL ROLE service_role;", beforeMarker,
    "DO $$ BEGIN RAISE NOTICE 'T55_ROW_LOCKED'; END $$;", "SELECT pg_sleep(1);", afterPause, "COMMIT;",
  ].join("\n"));
  await ready;
  let result: T;
  try { result = await duringPause(); }
  finally {
    const finished = await done;
    if (finished.code !== 0) throw new Error(`Held DB session failed: ${errors}`);
  }
  return result;
}

function lockOrder(id: string) {
  return `SELECT id FROM public.orders WHERE id = '${id}' FOR UPDATE;`;
}

function runPsql(sql: string) {
  return execFileSync("docker", psqlArgs(), {
    input: sql, encoding: "utf8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"],
  });
}

async function withAutoCompleteEnabled<T>(run: () => Promise<T>): Promise<T> {
  const previous = await db.from("app_settings").select("value")
    .eq("key", "auto_complete.enabled").maybeSingle();
  if (previous.error) throw previous.error;
  await must(db.from("app_settings").upsert({ key: "auto_complete.enabled", value: "true" }).select("key").single());
  try { return await run(); }
  finally {
    if (previous.data) {
      await must(db.from("app_settings").update({ value: previous.data.value })
        .eq("key", "auto_complete.enabled").select("key").single());
    } else {
      const { error } = await db.from("app_settings").delete().eq("key", "auto_complete.enabled");
      if (error) throw error;
    }
  }
}

async function must<T>(request: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await request;
  if (error) throw error;
  return data as NonNullable<T>;
}

function age(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

async function fixture(options: {
  status?: string;
  paymentMethod?: "cash" | "transfer";
  ageMinutes?: number;
  reportedAt?: string | null;
  cancelledAt?: string | null;
  rejectedAt?: string | null;
} = {}) {
  const menu = await must(db.from("menu_items").insert({ base_price: 3000, stock: 8 }).select("id").single());
  menus.push(menu.id);
  const order = await must(db.from("orders").insert({
    pickup_number: randomInt(100_000, 2_000_000_000),
    status: options.status ?? "cooking",
    payment_method: options.paymentMethod ?? "transfer",
    total_amount: 6000,
    idempotency_key: randomUUID(),
    status_token: randomBytes(32).toString("hex"),
    created_at: age(options.ageMinutes ?? 60),
    transfer_reported_at: options.reportedAt ?? null,
    cancel_requested_at: options.cancelledAt ?? null,
    cancel_rejected_at: options.rejectedAt ?? null,
    paid_at: age(30),
    cooking_started_at: age(25),
  }).select("id").single());
  orders.push(order.id);
  await must(db.from("order_items").insert({
    order_id: order.id, menu_item_id: menu.id, menu_name_ko: "T-55 fixture",
    unit_price: 3000, quantity: 2, line_total: 6000,
  }));
  return { id: order.id as string, menuId: menu.id as string };
}

function args(id: string, overrides: Record<string, unknown> = {}) {
  return { p_order_id: id, p_actor_id: actorId, p_reason: "입금 확인 실수", ...overrides };
}

async function snapshot(id: string, menuId: string) {
  return {
    order: await must(db.from("orders").select("*").eq("id", id).single()),
    menu: await must(db.from("menu_items").select("stock").eq("id", menuId).single()),
    history: await must(db.from("order_status_history")
      .select("from_status,to_status,action,actor_type,actor_id,reason")
      .eq("order_id", id).order("id")),
  };
}

beforeAll(async () => {
  const setting = await db.from("app_settings").select("value").eq("key", "payment.expire_minutes").maybeSingle();
  if (setting.error) throw setting.error;
  if (setting.data) expireMinutes = Number(setting.data.value);
  const email = `t55-${randomUUID()}@example.test`;
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
  if (!userId) return;
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw error;
});

describe("T-55 new pending cycle DB contract", () => {
  test("transfer cooking -> pending resets current marks, keeps stock and old report/rejection history", async () => {
    const reportedAt = age(40);
    const cancelledAt = age(38);
    const rejectedAt = age(37);
    const order = await fixture({ reportedAt, cancelledAt, rejectedAt });
    await must(db.from("order_status_history").insert({
      order_id: order.id, from_status: "pending", to_status: "pending",
      action: "cancel_request_reject", actor_type: "admin", actor_id: actorId, reason: "거절",
    }));

    const { data, error } = await db.rpc(rpc, args(order.id, { p_reason: "  입금 확인 실수  " }));
    expect(error).toBeNull();
    const after = await snapshot(order.id, order.menuId);
    expect(data).toMatchObject({ id: order.id, status: "pending" });
    expect(after.order).toMatchObject({
      status: "pending", transfer_reported_at: null,
      cancel_requested_at: null, cancel_rejected_at: null,
      paid_at: null, cooking_started_at: null,
    });
    expect(Date.parse(after.order.pending_since)).toBeGreaterThan(Date.parse(rejectedAt));
    expect(after.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(reportedAt)]);
    expect(after.menu.stock).toBe(8);
    expect(after.history).toEqual([
      { from_status: "pending", to_status: "pending", action: "cancel_request_reject", actor_type: "admin", actor_id: actorId, reason: "거절" },
      { from_status: "cooking", to_status: "pending", action: "revert_to_pending", actor_type: "admin", actor_id: actorId, reason: "입금 확인 실수" },
    ]);
    expect(await repo.setTransferReported(order.id)).not.toBeNull();
    expect(await repo.setCancelRequested(order.id)).not.toBeNull();
    const reReported = await snapshot(order.id, order.menuId);
    expect(reReported.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(reportedAt)]);
    expect(reReported.order.transfer_reported_at).not.toBeNull();
  });

  test.each([
    ["cash cooking", "cooking", "cash"],
    ["transfer pending", "pending", "transfer"],
    ["transfer completed", "completed", "transfer"],
  ] as const)("%s is rejected with no changes", async (_label, status, paymentMethod) => {
    const order = await fixture({ status, paymentMethod });
    const before = await snapshot(order.id, order.menuId);
    const { error } = await db.rpc(rpc, args(order.id));
    expect(error?.message).toBe("INVALID_TRANSITION");
    expect(await snapshot(order.id, order.menuId)).toEqual(before);
  });

  test.each([null, "", "   ", "x".repeat(201)])("invalid reason %s cannot change an order", async (reason) => {
    const order = await fixture();
    const before = await snapshot(order.id, order.menuId);
    const { error } = await db.rpc(rpc, args(order.id, { p_reason: reason }));
    expect(error?.message).toBe(reason === null || reason.trim() === "" ? "REASON_REQUIRED" : "VALIDATION_ERROR");
    expect(await snapshot(order.id, order.menuId)).toEqual(before);
  });

  test("legacy NULL uses created_at; reverted pending uses pending_since for expiration", async () => {
    const legacy = await fixture({ status: "pending", ageMinutes: expireMinutes + 1 });
    expect((await snapshot(legacy.id, legacy.menuId)).order.pending_since).toBeNull();
    const legacyReported = await fixture({
      status: "pending", ageMinutes: expireMinutes + 1,
      reportedAt: age(expireMinutes + 20),
    });
    const reverted = await fixture({ ageMinutes: expireMinutes + 30, reportedAt: age(expireMinutes + 20) });
    expect((await db.rpc(rpc, args(reverted.id))).error).toBeNull();
    const start = Date.parse((await snapshot(reverted.id, reverted.menuId)).order.pending_since);

    const before = await db.rpc("sweep_order_timeouts", {
      // PostgreSQL clock_timestamp keeps microseconds; JS Date.parse truncates them.
      p_now: new Date(start + (expireMinutes * 60_000) - 1_000).toISOString(),
    });
    expect(before.error).toBeNull();
    expect(before.data).toMatchObject({ expired: 1 });
    expect((await snapshot(legacy.id, legacy.menuId)).order.status).toBe("expired");
    expect((await snapshot(legacyReported.id, legacyReported.menuId)).order.status).toBe("pending");
    expect((await snapshot(reverted.id, reverted.menuId)).order.status).toBe("pending");

    const after = await db.rpc("sweep_order_timeouts", {
      p_now: new Date(start + expireMinutes * 60_000 + 1_000).toISOString(),
    });
    expect(after.error).toBeNull();
    expect(after.data).toMatchObject({ expired: 1 });
    const ended = await snapshot(reverted.id, reverted.menuId);
    expect(ended.order.status).toBe("expired");
    expect(ended.menu.stock).toBe(10);
    expect(ended.order.transfer_reported_history).toEqual([expect.any(String)]);
  });

  test("a report in the new pending cycle blocks expiration, while its old timestamp remains archived", async () => {
    const oldReport = age(40);
    const order = await fixture({ reportedAt: oldReport });
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    const reportedAgain = await repo.setTransferReported(order.id);
    expect(reportedAgain).not.toBeNull();
    const start = Date.parse((await snapshot(order.id, order.menuId)).order.pending_since);

    const sweep = await db.rpc("sweep_order_timeouts", {
      p_now: new Date(start + (expireMinutes + 1) * 60_000).toISOString(),
    });
    expect(sweep.error).toBeNull();
    expect(sweep.data).toMatchObject({ expired: 0 });
    const after = await snapshot(order.id, order.menuId);
    expect(after.order.status).toBe("pending");
    expect(after.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(oldReport)]);
    expect(Date.parse(after.order.transfer_reported_at)).toBe(Date.parse(reportedAgain!));
  });

  test("a new-cycle report still blocks expiration when the app clock is behind the DB clock", async () => {
    const order = await fixture({ reportedAt: age(40) });
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    const start = Date.parse((await snapshot(order.id, order.menuId)).order.pending_since);
    const appClockBehind = new Date(start - 60_000).toISOString();
    await must(db.from("orders").update({ transfer_reported_at: appClockBehind }).eq("id", order.id).select("id").single());

    const sweep = await db.rpc("sweep_order_timeouts", {
      p_now: new Date(start + (expireMinutes + 1) * 60_000).toISOString(),
    });
    expect(sweep.error).toBeNull();
    expect(sweep.data).toMatchObject({ expired: 0 });
    const after = await snapshot(order.id, order.menuId);
    expect(after.order.status).toBe("pending");
    expect(after.order.transfer_reported_at).not.toBeNull();
    expect(after.menu.stock).toBe(8);
  });

  test("two concurrent admins can revert only once", async () => {
    const order = await fixture();
    const results = await Promise.all([db.rpc(rpc, args(order.id)), db.rpc(rpc, args(order.id))]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.message).toBe("INVALID_TRANSITION");
    const after = await snapshot(order.id, order.menuId);
    expect(after.history).toHaveLength(1);
    expect(after.menu.stock).toBe(8);
  });

  test("multiple reverts append each report timestamp and keep only the current cycle open", async () => {
    const firstReport = age(40);
    const order = await fixture({ reportedAt: firstReport });
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    const firstPendingSince = Date.parse((await snapshot(order.id, order.menuId)).order.pending_since);
    const secondReport = await repo.setTransferReported(order.id);
    expect(secondReport).not.toBeNull();
    const backToCooking = await db.rpc("transition_order", {
      p_order_id: order.id, p_from: "pending", p_to: "cooking",
      p_action: "start_cooking", p_actor_type: "admin", p_actor_id: actorId,
      p_reason: null, p_refund_channel: null,
    });
    expect(backToCooking.error).toBeNull();
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();

    const after = await snapshot(order.id, order.menuId);
    expect(after.order.status).toBe("pending");
    expect(after.order.transfer_reported_at).toBeNull();
    expect(after.order.transfer_reported_history.map(Date.parse))
      .toEqual([Date.parse(firstReport), Date.parse(secondReport!)]);
    expect(Date.parse(after.order.pending_since)).toBeGreaterThanOrEqual(firstPendingSince);
    expect(after.history.map((entry: { action: string }) => entry.action))
      .toEqual(["revert_to_pending", "start_cooking", "revert_to_pending"]);
    expect(after.menu.stock).toBe(8);
  });

  test.each(["x", "x".repeat(200)])("reason boundary %s is accepted", async (reason) => {
    const order = await fixture();
    const { error } = await db.rpc(rpc, args(order.id, { p_reason: reason }));
    expect(error).toBeNull();
    const after = await snapshot(order.id, order.menuId);
    expect(after.history[0].reason).toBe(reason);
  });

  test("null actor ID is rejected without changes", async () => {
    const order = await fixture();
    const before = await snapshot(order.id, order.menuId);
    const { error } = await db.rpc(rpc, args(order.id, { p_actor_id: null }));
    expect(error?.message).toBe("VALIDATION_ERROR");
    expect(await snapshot(order.id, order.menuId)).toEqual(before);
  });

  test("history INSERT failure rolls back status, cycle, cancellation marks and archived report", async () => {
    const order = await fixture({ reportedAt: age(40), cancelledAt: age(38), rejectedAt: age(37) });
    const before = await snapshot(order.id, order.menuId);
    runPsql(`
      CREATE FUNCTION public.t55_revert_history_failure() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.order_id = '${order.id}' THEN
          RAISE EXCEPTION 'T55_HISTORY_INSERT_FAILED';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER t55_revert_history_failure BEFORE INSERT ON public.order_status_history
      FOR EACH ROW EXECUTE FUNCTION public.t55_revert_history_failure();
    `);
    try {
      const { error } = await db.rpc(rpc, args(order.id));
      expect(error?.message).toBe("T55_HISTORY_INSERT_FAILED");
      expect(await snapshot(order.id, order.menuId)).toEqual(before);
    } finally {
      runPsql(`
        DROP TRIGGER IF EXISTS t55_revert_history_failure ON public.order_status_history;
        DROP FUNCTION IF EXISTS public.t55_revert_history_failure();
      `);
    }
  });

  test("revert holding the row makes T-19 skip it; the next cycle remains pending", async () => {
    await withAutoCompleteEnabled(async () => {
      const oldReport = age(40);
      const order = await fixture({ reportedAt: oldReport });
      const sweep = await withHeldRow(
        `DO $$ BEGIN PERFORM public.revert_transfer_order_to_pending('${order.id}', '${actorId}', 'race'); END $$;`,
        "",
        () => db.rpc("sweep_order_timeouts", { p_now: new Date().toISOString() }),
      );
      expect(sweep.error).toBeNull();
      expect(sweep.data).toMatchObject({ completed: 0, expired: 0 });
      const after = await snapshot(order.id, order.menuId);
      expect(after.order.status).toBe("pending");
      expect(after.order.transfer_reported_at).toBeNull();
      expect(after.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(oldReport)]);
      expect(after.history.map((entry: { action: string }) => entry.action)).toEqual(["revert_to_pending"]);
      expect(after.menu.stock).toBe(8);
    });
  }, 20_000);

  test("T-19 holding the row completes first; revert then rejects the terminal state", async () => {
    await withAutoCompleteEnabled(async () => {
      const oldReport = age(40);
      const order = await fixture({ reportedAt: oldReport });
      const revert = await withHeldRow(lockOrder(order.id),
        "SELECT public.sweep_order_timeouts(now());",
        () => db.rpc(rpc, args(order.id)));
      expect(revert.error?.message).toBe("INVALID_TRANSITION");
      const after = await snapshot(order.id, order.menuId);
      expect(after.order.status).toBe("completed");
      expect(after.order.pending_since).toBeNull();
      expect(Date.parse(after.order.transfer_reported_at)).toBe(Date.parse(oldReport));
      expect(after.order.transfer_reported_history).toEqual([]);
      expect(after.history.map((entry: { action: string }) => entry.action)).toEqual(["auto_complete"]);
      expect(after.menu.stock).toBe(8);
    });
  }, 20_000);

  test("new-cycle report holding the row makes T-18 skip expiration", async () => {
    const oldReport = age(40);
    const order = await fixture({ reportedAt: oldReport });
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    const start = Date.parse((await snapshot(order.id, order.menuId)).order.pending_since);
    const sweep = await withHeldRow(
      `UPDATE public.orders SET transfer_reported_at = clock_timestamp()
       WHERE id = '${order.id}' AND status = 'pending' AND payment_method = 'transfer'
         AND transfer_reported_at IS NULL;`,
      "",
      () => db.rpc("sweep_order_timeouts", {
        p_now: new Date(start + (expireMinutes + 1) * 60_000).toISOString(),
      }),
    );
    expect(sweep.error).toBeNull();
    expect(sweep.data).toMatchObject({ expired: 0 });
    const after = await snapshot(order.id, order.menuId);
    expect(after.order.status).toBe("pending");
    expect(after.order.transfer_reported_at).not.toBeNull();
    expect(after.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(oldReport)]);
    expect(after.history.map((entry: { action: string }) => entry.action)).toEqual(["revert_to_pending"]);
    expect(after.menu.stock).toBe(8);
  }, 20_000);

  test("T-18 holding the row expires first; new-cycle report cannot mark it afterward", async () => {
    const oldReport = age(40);
    const order = await fixture({ reportedAt: oldReport });
    expect((await db.rpc(rpc, args(order.id))).error).toBeNull();
    const start = Date.parse((await snapshot(order.id, order.menuId)).order.pending_since);
    const reported = await withHeldRow(lockOrder(order.id),
      `SELECT public.sweep_order_timeouts('${new Date(start + (expireMinutes + 1) * 60_000).toISOString()}');`,
      () => repo.setTransferReported(order.id));
    expect(reported).toBeNull();
    const after = await snapshot(order.id, order.menuId);
    expect(after.order.status).toBe("expired");
    expect(after.order.transfer_reported_at).toBeNull();
    expect(after.order.transfer_reported_history.map(Date.parse)).toEqual([Date.parse(oldReport)]);
    expect(after.history.map((entry: { action: string }) => entry.action)).toEqual(["revert_to_pending", "expire"]);
    expect(after.menu.stock).toBe(10);
  }, 20_000);

  test("missing order is rejected", async () => {
    const { error } = await db.rpc(rpc, args(randomUUID()));
    expect(error?.message).toBe("ORDER_NOT_FOUND");
  });

  test.each([["anon", anon], ["authenticated", authenticated]] as const)("%s cannot call the RPC", async (_role, client) => {
    const order = await fixture();
    const before = await snapshot(order.id, order.menuId);
    const { error } = await client.rpc(rpc, args(order.id));
    expect(error?.code).toBe("42501");
    expect(await snapshot(order.id, order.menuId)).toEqual(before);
  });
});
