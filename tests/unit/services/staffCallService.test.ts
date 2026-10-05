import { describe, it, expect, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import { acknowledgeStaffCall, callStaff, getStaffCalls, STAFF_CALL_COOLDOWN_SECONDS } from "@/services/staffCallService";
import type { OrderRepository } from "@/services/ports";
import type { StaffCallCreateResult, StaffCallRepository, StaffCallWithPickup } from "@/infra/repositories/staffCallRepository";

const orderId = "11111111-1111-4111-8111-111111111111";
const baseTime = new Date("2026-10-04T12:00:00.000Z");
function orderRepo(exists = true) { return { findByToken: vi.fn().mockResolvedValue(exists ? { id: orderId, pickupNumber: 42, status: "cooking", paymentMethod: "cash", totalAmount: 5000, items: [], createdAt: baseTime.toISOString(), transferReportedAt: null, cancelRequestedAt: null, cancelRejectedAt: null } : null) } as unknown as OrderRepository; }
function staffRepo(result: StaffCallCreateResult): StaffCallRepository { return { createCallIfAllowed: vi.fn().mockResolvedValue(result), listCalls: vi.fn().mockResolvedValue([]), acknowledgeCall: vi.fn().mockResolvedValue(null) }; }

describe("T-27 staffCallService", () => {
  it("없는 토큰은 404", async () => { await expect(callStaff({ orderRepository: orderRepo(false), staffCallRepository: staffRepo({ accepted: true, retryAfterSeconds: 120, callId: "33333333-3333-4333-8333-333333333333", calledAt: baseTime.toISOString() }) }, "invalid", baseTime)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); });
  it("DB 원자 호출 성공 결과를 응답으로 매핑한다", async () => { const repo = staffRepo({ accepted: true, retryAfterSeconds: 120, callId: "33333333-3333-4333-8333-333333333333", calledAt: baseTime.toISOString() }); const result = await callStaff({ orderRepository: orderRepo(), staffCallRepository: repo }, "token", baseTime); expect(result).toMatchObject({ orderId, pickupNumber: 42, cooldownSeconds: STAFF_CALL_COOLDOWN_SECONDS }); expect(repo.createCallIfAllowed).toHaveBeenCalledWith(orderId, baseTime.toISOString()); });
  it("DB가 119초 재호출을 차단하면 429와 남은 1초를 전달한다", async () => { const repo = staffRepo({ accepted: false, retryAfterSeconds: 1, callId: null, calledAt: null }); try { await callStaff({ orderRepository: orderRepo(), staffCallRepository: repo }, "token", new Date(baseTime.getTime() + 119000)); expect.unreachable(); } catch (error) { expect(error).toBeInstanceOf(AppError); expect(error).toMatchObject({ code: "CALL_COOLDOWN", status: 429, details: { retryAfterSeconds: 1 } }); } });
  it("목록의 미확인 개수를 센다", async () => { const calls: StaffCallWithPickup[] = [{ id: "1", orderId, pickupNumber: 42, calledAt: baseTime.toISOString(), acknowledgedAt: null, acknowledgedBy: null }, { id: "2", orderId, pickupNumber: 42, calledAt: baseTime.toISOString(), acknowledgedAt: baseTime.toISOString(), acknowledgedBy: "admin" }]; const repo = staffRepo({ accepted: true, retryAfterSeconds: 120, callId: null, calledAt: null }); repo.listCalls = vi.fn().mockResolvedValue(calls); expect((await getStaffCalls(repo)).unacknowledgedCount).toBe(1); });
  it("확인 대상이 없으면 404", async () => { const repo = staffRepo({ accepted: true, retryAfterSeconds: 120, callId: null, calledAt: null }); await expect(acknowledgeStaffCall(repo, "missing", "admin")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 }); });
});
