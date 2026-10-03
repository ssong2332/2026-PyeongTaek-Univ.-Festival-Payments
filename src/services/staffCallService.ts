import { AppError } from "@/lib/api/errors";
import type { OrderRepository } from "@/services/ports";
import type { StaffCallRepository, StaffCallWithPickup } from "@/infra/repositories/staffCallRepository";
import type { CallStaffResponse, StaffCallsListResponse } from "@/lib/dto/staffCall";

export const STAFF_CALL_COOLDOWN_SECONDS = 120; // 2분 (F-33, Open Question #18)
export const STAFF_CALL_COOLDOWN_MS = STAFF_CALL_COOLDOWN_SECONDS * 1000;

export interface StaffCallServiceDeps {
  staffCallRepository: StaffCallRepository;
  orderRepository: OrderRepository;
}

/**
 * 고객의 직원 호출 요청 처리
 * - token으로 주문 확인 (없으면 404)
 * - 동일 주문 2분 내 재호출 거부 (119초 거부 / 120초 허용)
 */
export async function callStaff(
  deps: StaffCallServiceDeps,
  token: string,
  now: Date = new Date(),
): Promise<CallStaffResponse> {
  const order = await deps.orderRepository.findByToken(token);
  if (!order) {
    throw new AppError("NOT_FOUND", 404);
  }

  const latestCall = await deps.staffCallRepository.getLatestCallByOrderId(order.id);
  if (latestCall) {
    const elapsedMs = now.getTime() - new Date(latestCall.called_at).getTime();
    if (elapsedMs < STAFF_CALL_COOLDOWN_MS) {
      const remainingSeconds = Math.max(1, Math.ceil((STAFF_CALL_COOLDOWN_MS - elapsedMs) / 1000));
      throw new AppError("CALL_COOLDOWN", 429, { retryAfter: remainingSeconds });
    }
  }

  const newCall = await deps.staffCallRepository.createCall(order.id, now.toISOString());

  return {
    callId: newCall.id,
    orderId: order.id,
    pickupNumber: order.pickupNumber,
    calledAt: newCall.called_at,
    cooldownSeconds: STAFF_CALL_COOLDOWN_SECONDS,
  };
}

/**
 * 관리자 대시보드용 직원 호출 목록 조회
 */
export async function getStaffCalls(
  repository: StaffCallRepository,
  options?: { unacknowledgedOnly?: boolean; limit?: number },
): Promise<StaffCallsListResponse> {
  const calls = await repository.listCalls(options);
  const unacknowledged = calls.filter((c) => c.acknowledgedAt === null);

  return {
    calls,
    unacknowledgedCount: unacknowledged.length,
  };
}

/**
 * 관리자의 직원 호출 확인 처리 (알림 해제)
 */
export async function acknowledgeStaffCall(
  repository: StaffCallRepository,
  callId: string,
  adminUserId: string,
  now: Date = new Date(),
): Promise<StaffCallWithPickup> {
  const updated = await repository.acknowledgeCall(callId, adminUserId, now.toISOString());
  if (!updated) {
    throw new AppError("NOT_FOUND", 404);
  }
  return updated;
}
