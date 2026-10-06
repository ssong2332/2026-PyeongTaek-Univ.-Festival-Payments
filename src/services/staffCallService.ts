import { AppError } from "@/lib/api/errors";
import type { OrderRepository } from "@/services/ports";
import type { StaffCallRepository, StaffCallWithPickup } from "@/infra/repositories/staffCallRepository";
import type { CallStaffResponse, StaffCallsListResponse } from "@/lib/dto/staffCall";

export const STAFF_CALL_COOLDOWN_SECONDS = 120;

export interface StaffCallServiceDeps { staffCallRepository: StaffCallRepository; orderRepository: OrderRepository }

export async function callStaff(deps: StaffCallServiceDeps, token: string, now: Date = new Date()): Promise<CallStaffResponse> {
  const order = await deps.orderRepository.findByToken(token);
  if (!order) throw new AppError("NOT_FOUND", 404);

  const creation = await deps.staffCallRepository.createCallIfAllowed(order.id, now.toISOString());
  if (!creation.accepted) {
    throw new AppError("CALL_COOLDOWN", 429, { retryAfterSeconds: creation.retryAfterSeconds });
  }
  if (!creation.callId || !creation.calledAt) throw new AppError("INTERNAL_ERROR", 500);

  return { callId: creation.callId, orderId: order.id, pickupNumber: order.pickupNumber, calledAt: creation.calledAt, cooldownSeconds: STAFF_CALL_COOLDOWN_SECONDS };
}

export async function getStaffCalls(repository: StaffCallRepository, options?: { unacknowledgedOnly?: boolean; limit?: number }): Promise<StaffCallsListResponse> {
  const calls = await repository.listCalls(options);
  return { calls, unacknowledgedCount: calls.filter((call) => call.acknowledgedAt === null).length };
}

export async function acknowledgeStaffCall(repository: StaffCallRepository, callId: string, adminUserId: string, now: Date = new Date()): Promise<StaffCallWithPickup> {
  const updated = await repository.acknowledgeCall(callId, adminUserId, now.toISOString());
  if (!updated) throw new AppError("NOT_FOUND", 404);
  return updated;
}
