import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseStaffCallRepository } from "@/infra/repositories/staffCallRepository";
import { CallStaffResponseSchema, StaffCallsListResponseSchema, StaffCallDtoSchema } from "@/lib/dto/staffCall";

const id = "11111111-1111-4111-8111-111111111111";
const dbTime = "2026-10-05T05:07:45.731+00:00";
const isoTime = "2026-10-05T05:07:45.731Z";
const row = { id, order_id: id, called_at: dbTime, acknowledged_at: null, acknowledged_by: null, orders: { pickup_number: 1 } };

describe("staff call PostgreSQL timestamp mapping", () => {
  it("maps an accepted RPC timestamp into the customer response contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ accepted: true, retry_after_seconds: 120, call_id: id, call_called_at: dbTime }], error: null });
    const repository = new SupabaseStaffCallRepository({ rpc } as unknown as SupabaseClient);
    const result = await repository.createCallIfAllowed(id, isoTime);
    expect(result.calledAt).toBe(isoTime);
    expect(CallStaffResponseSchema.safeParse({ callId: result.callId, orderId: id, pickupNumber: 1, calledAt: result.calledAt, cooldownSeconds: 120 }).success).toBe(true);
  });

  it("preserves null timestamps for a rejected cooldown RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ accepted: false, retry_after_seconds: 1, call_id: null, call_called_at: null }], error: null });
    const repository = new SupabaseStaffCallRepository({ rpc } as unknown as SupabaseClient);
    expect(await repository.createCallIfAllowed(id, isoTime)).toEqual({ accepted: false, retryAfterSeconds: 1, callId: null, calledAt: null });
  });

  it("maps database list timestamps into the administrator feed contract", async () => {
    const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), is: vi.fn() };
    query.select.mockReturnValue(query); query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query); query.is.mockResolvedValue({ data: [row], error: null });
    const repository = new SupabaseStaffCallRepository({ from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient);
    const calls = await repository.listCalls({ unacknowledgedOnly: true });
    expect(calls[0]).toMatchObject({ calledAt: isoTime, acknowledgedAt: null });
    expect(StaffCallsListResponseSchema.safeParse({ calls, unacknowledgedCount: 1 }).success).toBe(true);
  });

  it("maps acknowledgement timestamps into the acknowledgement response contract", async () => {
    const query = { update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
    query.update.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { ...row, acknowledged_at: dbTime, acknowledged_by: id }, error: null });
    const repository = new SupabaseStaffCallRepository({ from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient);
    const call = await repository.acknowledgeCall(id, id, isoTime);
    expect(call).toMatchObject({ calledAt: isoTime, acknowledgedAt: isoTime });
    expect(StaffCallDtoSchema.safeParse(call).success).toBe(true);
  });
});
