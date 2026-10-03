import { describe, it, expect, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import {
  callStaff,
  getStaffCalls,
  acknowledgeStaffCall,
  STAFF_CALL_COOLDOWN_SECONDS,
} from "@/services/staffCallService";
import type { OrderRepository } from "@/services/ports";
import type { StaffCallRepository, StaffCallRecord, StaffCallWithPickup } from "@/infra/repositories/staffCallRepository";

describe("T-27 / F-33 staffCallService", () => {
  const dummyOrderId = "11111111-1111-4111-8111-111111111111";
  const dummyToken = "a".repeat(64);
  const baseTime = new Date("2026-10-04T12:00:00.000Z");

  const createMockOrderRepo = (exists = true): OrderRepository => ({
    createOrder: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    findById: vi.fn(),
    transition: vi.fn(),
    countWaitingBefore: vi.fn(),
    findByToken: vi.fn().mockResolvedValue(
      exists
        ? {
            id: dummyOrderId,
            pickupNumber: 42,
            status: "cooking",
            paymentMethod: "cash",
            totalAmount: 5000,
            items: [],
            createdAt: baseTime.toISOString(),
            transferReportedAt: null,
            cancelRequestedAt: null,
            cancelRejectedAt: null,
          }
        : null
    ),
  });

  const createMockStaffCallRepo = (latestCall: StaffCallRecord | null = null): StaffCallRepository => {
    let currentLatest = latestCall;
    return {
      getLatestCallByOrderId: vi.fn().mockImplementation(async () => currentLatest),
      createCall: vi.fn().mockImplementation(async (_orderId: string, calledAt?: string) => {
        const record: StaffCallRecord = {
          id: "33333333-3333-4333-8333-333333333333",
          order_id: dummyOrderId,
          called_at: calledAt ?? baseTime.toISOString(),
          acknowledged_at: null,
          acknowledged_by: null,
          created_at: calledAt ?? baseTime.toISOString(),
        };
        currentLatest = record;
        return record;
      }),
      listCalls: vi.fn().mockResolvedValue([]),
      acknowledgeCall: vi.fn().mockResolvedValue(null),
    };
  };

  describe("callStaff (F-33 중복 방지 규칙)", () => {
    it("존재하지 않는 토큰이면 404 NOT_FOUND를 던진다", async () => {
      const orderRepo = createMockOrderRepo(false);
      const staffCallRepo = createMockStaffCallRepo(null);

      await expect(
        callStaff({ orderRepository: orderRepo, staffCallRepository: staffCallRepo }, "invalid-token", baseTime)
      ).rejects.toThrow(AppError);

      await expect(
        callStaff({ orderRepository: orderRepo, staffCallRepository: staffCallRepo }, "invalid-token", baseTime)
      ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });

    it("첫 호출은 즉시 성공하고 2분 쿨다운 정보를 반환한다", async () => {
      const orderRepo = createMockOrderRepo(true);
      const staffCallRepo = createMockStaffCallRepo(null);

      const result = await callStaff(
        { orderRepository: orderRepo, staffCallRepository: staffCallRepo },
        dummyToken,
        baseTime
      );

      expect(result.orderId).toBe(dummyOrderId);
      expect(result.pickupNumber).toBe(42);
      expect(result.calledAt).toBe(baseTime.toISOString());
      expect(result.cooldownSeconds).toBe(STAFF_CALL_COOLDOWN_SECONDS);
      expect(staffCallRepo.createCall).toHaveBeenCalledWith(dummyOrderId, baseTime.toISOString());
    });

    // Tasks.md 필수 요구 테스트: 1분 59초 재호출 거부
    it("1분 59초(119초) 경과 시점 재호출은 429 CALL_COOLDOWN으로 거부된다", async () => {
      const firstCallRecord: StaffCallRecord = {
        id: "call-1",
        order_id: dummyOrderId,
        called_at: baseTime.toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        created_at: baseTime.toISOString(),
      };
      const orderRepo = createMockOrderRepo(true);
      const staffCallRepo = createMockStaffCallRepo(firstCallRecord);

      // 1분 59초 = 119초 경과
      const at1Min59Sec = new Date(baseTime.getTime() + 119 * 1000);

      try {
        await callStaff(
          { orderRepository: orderRepo, staffCallRepository: staffCallRepo },
          dummyToken,
          at1Min59Sec
        );
        expect.unreachable("1분 59초 재호출은 거부되어야 합니다.");
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.code).toBe("CALL_COOLDOWN");
        expect(appErr.status).toBe(429);
        expect((appErr.details as { retryAfter: number }).retryAfter).toBe(1);
      }
    });

    // Tasks.md 필수 요구 테스트: 2분 후 허용
    it("정확히 2분(120초) 경과 후 재호출은 정상 허용된다", async () => {
      const firstCallRecord: StaffCallRecord = {
        id: "call-1",
        order_id: dummyOrderId,
        called_at: baseTime.toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        created_at: baseTime.toISOString(),
      };
      const orderRepo = createMockOrderRepo(true);
      const staffCallRepo = createMockStaffCallRepo(firstCallRecord);

      // 정확히 2분 = 120초 경과
      const at2Minutes = new Date(baseTime.getTime() + 120 * 1000);

      const result = await callStaff(
        { orderRepository: orderRepo, staffCallRepository: staffCallRepo },
        dummyToken,
        at2Minutes
      );

      expect(result.orderId).toBe(dummyOrderId);
      expect(result.pickupNumber).toBe(42);
      expect(result.calledAt).toBe(at2Minutes.toISOString());
    });

    it("2분 1초(121초) 경과 후 재호출도 정상 허용된다", async () => {
      const firstCallRecord: StaffCallRecord = {
        id: "call-1",
        order_id: dummyOrderId,
        called_at: baseTime.toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
        created_at: baseTime.toISOString(),
      };
      const orderRepo = createMockOrderRepo(true);
      const staffCallRepo = createMockStaffCallRepo(firstCallRecord);

      // 2분 1초 = 121초 경과
      const at2Min1Sec = new Date(baseTime.getTime() + 121 * 1000);

      const result = await callStaff(
        { orderRepository: orderRepo, staffCallRepository: staffCallRepo },
        dummyToken,
        at2Min1Sec
      );

      expect(result.orderId).toBe(dummyOrderId);
      expect(result.calledAt).toBe(at2Min1Sec.toISOString());
    });
  });

  describe("getStaffCalls (관리자 목록 조회)", () => {
    it("직원 호출 목록과 미확인 건수를 올바르게 반환한다", async () => {
      const mockCalls: StaffCallWithPickup[] = [
        {
          id: "call-1",
          orderId: dummyOrderId,
          pickupNumber: 42,
          calledAt: baseTime.toISOString(),
          acknowledgedAt: null,
          acknowledgedBy: null,
        },
        {
          id: "call-2",
          orderId: dummyOrderId,
          pickupNumber: 42,
          calledAt: new Date(baseTime.getTime() - 10000).toISOString(),
          acknowledgedAt: baseTime.toISOString(),
          acknowledgedBy: "admin-1",
        },
      ];

      const staffCallRepo: StaffCallRepository = {
        getLatestCallByOrderId: vi.fn(),
        createCall: vi.fn(),
        listCalls: vi.fn().mockResolvedValue(mockCalls),
        acknowledgeCall: vi.fn(),
      };

      const result = await getStaffCalls(staffCallRepo);
      expect(result.calls).toHaveLength(2);
      expect(result.unacknowledgedCount).toBe(1);
    });
  });

  describe("acknowledgeStaffCall (관리자 확인 해제)", () => {
    it("호출 확인에 성공하면 갱신된 데이터를 반환한다", async () => {
      const ackTime = new Date("2026-10-04T12:05:00.000Z");
      const mockUpdated: StaffCallWithPickup = {
        id: "call-1",
        orderId: dummyOrderId,
        pickupNumber: 42,
        calledAt: baseTime.toISOString(),
        acknowledgedAt: ackTime.toISOString(),
        acknowledgedBy: "admin-123",
      };

      const staffCallRepo: StaffCallRepository = {
        getLatestCallByOrderId: vi.fn(),
        createCall: vi.fn(),
        listCalls: vi.fn(),
        acknowledgeCall: vi.fn().mockResolvedValue(mockUpdated),
      };

      const result = await acknowledgeStaffCall(staffCallRepo, "call-1", "admin-123", ackTime);
      expect(result.acknowledgedAt).toBe(ackTime.toISOString());
      expect(result.acknowledgedBy).toBe("admin-123");
    });

    it("존재하지 않는 호출 ID면 404 NOT_FOUND를 던진다", async () => {
      const staffCallRepo: StaffCallRepository = {
        getLatestCallByOrderId: vi.fn(),
        createCall: vi.fn(),
        listCalls: vi.fn(),
        acknowledgeCall: vi.fn().mockResolvedValue(null),
      };

      await expect(
        acknowledgeStaffCall(staffCallRepo, "non-existent", "admin-123")
      ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });
  });
});
