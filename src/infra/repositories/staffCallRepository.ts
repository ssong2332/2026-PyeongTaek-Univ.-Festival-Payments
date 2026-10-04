import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export interface StaffCallCreateResult {
  accepted: boolean;
  retryAfterSeconds: number;
  callId: string | null;
  calledAt: string | null;
}

export interface StaffCallWithPickup {
  id: string;
  orderId: string;
  pickupNumber: number;
  calledAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface StaffCallRepository {
  createCallIfAllowed(orderId: string, calledAt: string): Promise<StaffCallCreateResult>;
  listCalls(options?: { unacknowledgedOnly?: boolean; limit?: number }): Promise<StaffCallWithPickup[]>;
  acknowledgeCall(id: string, adminUserId: string, acknowledgedAt?: string): Promise<StaffCallWithPickup | null>;
}

export class SupabaseStaffCallRepository implements StaffCallRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createCallIfAllowed(orderId: string, calledAt: string): Promise<StaffCallCreateResult> {
    const { data, error } = await this.client.rpc("create_staff_call_if_allowed", { p_order_id: orderId, p_now: calledAt });
    if (error) {
      logger.error("staff_calls.create_if_allowed_failed", { orderId, error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }
    type Row = { accepted: boolean; retry_after_seconds: number; call_id: string | null; call_called_at: string | null };
    const row = ((data ?? []) as unknown as Row[])[0];
    if (!row) throw new AppError("INTERNAL_ERROR", 500);
    return { accepted: row.accepted, retryAfterSeconds: row.retry_after_seconds, callId: row.call_id, calledAt: row.call_called_at };
  }

  async listCalls(options?: { unacknowledgedOnly?: boolean; limit?: number }): Promise<StaffCallWithPickup[]> {
    const limit = options?.limit ?? 50;
    let query = this.client.from("staff_calls")
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, orders!inner(pickup_number)")
      .order("called_at", { ascending: false }).limit(limit);
    if (options?.unacknowledgedOnly) query = query.is("acknowledged_at", null);
    const { data, error } = await query;
    if (error) {
      logger.error("staff_calls.list_failed", { error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }
    type Row = { id: string; order_id: string; called_at: string; acknowledged_at: string | null; acknowledged_by: string | null; orders: { pickup_number: number } | { pickup_number: number }[] };
    return ((data || []) as unknown as Row[]).map((row) => ({
      id: row.id, orderId: row.order_id,
      pickupNumber: Array.isArray(row.orders) ? row.orders[0]?.pickup_number ?? 0 : row.orders?.pickup_number ?? 0,
      calledAt: row.called_at, acknowledgedAt: row.acknowledged_at, acknowledgedBy: row.acknowledged_by,
    }));
  }

  async acknowledgeCall(id: string, adminUserId: string, acknowledgedAt?: string): Promise<StaffCallWithPickup | null> {
    const { data, error } = await this.client.from("staff_calls")
      .update({ acknowledged_at: acknowledgedAt ?? new Date().toISOString(), acknowledged_by: adminUserId })
      .eq("id", id)
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, orders!inner(pickup_number)")
      .maybeSingle();
    if (error) {
      logger.error("staff_calls.acknowledge_failed", { id, error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }
    if (!data) return null;
    type Row = { id: string; order_id: string; called_at: string; acknowledged_at: string | null; acknowledged_by: string | null; orders: { pickup_number: number } | { pickup_number: number }[] };
    const row = data as unknown as Row;
    return {
      id: row.id, orderId: row.order_id,
      pickupNumber: Array.isArray(row.orders) ? row.orders[0]?.pickup_number ?? 0 : row.orders?.pickup_number ?? 0,
      calledAt: row.called_at, acknowledgedAt: row.acknowledged_at, acknowledgedBy: row.acknowledged_by,
    };
  }
}
