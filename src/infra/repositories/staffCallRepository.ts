import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export interface StaffCallRecord {
  id: string;
  order_id: string;
  called_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
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
  getLatestCallByOrderId(orderId: string): Promise<StaffCallRecord | null>;
  createCall(orderId: string, calledAt?: string): Promise<StaffCallRecord>;
  listCalls(options?: { unacknowledgedOnly?: boolean; limit?: number }): Promise<StaffCallWithPickup[]>;
  acknowledgeCall(id: string, adminUserId: string, acknowledgedAt?: string): Promise<StaffCallWithPickup | null>;
}

export class SupabaseStaffCallRepository implements StaffCallRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getLatestCallByOrderId(orderId: string): Promise<StaffCallRecord | null> {
    const { data, error } = await this.client
      .from("staff_calls")
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, created_at")
      .eq("order_id", orderId)
      .order("called_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error("staff_calls.get_latest_failed", { orderId, error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }

    return data as StaffCallRecord | null;
  }

  async createCall(orderId: string, calledAt?: string): Promise<StaffCallRecord> {
    const payload: { order_id: string; called_at?: string } = { order_id: orderId };
    if (calledAt) {
      payload.called_at = calledAt;
    }

    const { data, error } = await this.client
      .from("staff_calls")
      .insert(payload)
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, created_at")
      .single();

    if (error || !data) {
      logger.error("staff_calls.create_failed", { orderId, error: error?.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }

    return data as StaffCallRecord;
  }

  async listCalls(options?: { unacknowledgedOnly?: boolean; limit?: number }): Promise<StaffCallWithPickup[]> {
    const limit = options?.limit ?? 50;
    let query = this.client
      .from("staff_calls")
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, orders!inner(pickup_number)")
      .order("called_at", { ascending: false })
      .limit(limit);

    if (options?.unacknowledgedOnly) {
      query = query.is("acknowledged_at", null);
    }

    const { data, error } = await query;
    if (error) {
      logger.error("staff_calls.list_failed", { error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }

    type Row = {
      id: string;
      order_id: string;
      called_at: string;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
      orders: { pickup_number: number } | { pickup_number: number }[];
    };

    return ((data || []) as unknown as Row[]).map((row) => {
      const pickupNumber = Array.isArray(row.orders)
        ? row.orders[0]?.pickup_number ?? 0
        : row.orders?.pickup_number ?? 0;

      return {
        id: row.id,
        orderId: row.order_id,
        pickupNumber,
        calledAt: row.called_at,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by,
      };
    });
  }

  async acknowledgeCall(
    id: string,
    adminUserId: string,
    acknowledgedAt?: string,
  ): Promise<StaffCallWithPickup | null> {
    const ackTime = acknowledgedAt ?? new Date().toISOString();

    const { data, error } = await this.client
      .from("staff_calls")
      .update({
        acknowledged_at: ackTime,
        acknowledged_by: adminUserId,
      })
      .eq("id", id)
      .select("id, order_id, called_at, acknowledged_at, acknowledged_by, orders!inner(pickup_number)")
      .maybeSingle();

    if (error) {
      logger.error("staff_calls.acknowledge_failed", { id, error: error.message });
      throw new AppError("INTERNAL_ERROR", 500);
    }

    if (!data) return null;

    type Row = {
      id: string;
      order_id: string;
      called_at: string;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
      orders: { pickup_number: number } | { pickup_number: number }[];
    };

    const row = data as unknown as Row;
    const pickupNumber = Array.isArray(row.orders)
      ? row.orders[0]?.pickup_number ?? 0
      : row.orders?.pickup_number ?? 0;

    return {
      id: row.id,
      orderId: row.order_id,
      pickupNumber,
      calledAt: row.called_at,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
    };
  }
}
