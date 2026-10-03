import { describe, it, expect } from "vitest";
import {
  CallStaffResponseSchema,
  StaffCallDtoSchema,
  StaffCallsListResponseSchema,
} from "@/lib/dto/staffCall";

describe("T-27 staffCall DTO Schemas", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";
  const validIso = "2026-10-04T12:00:00.000Z";

  describe("CallStaffResponseSchema", () => {
    it("유효한 직원 호출 응답을 파싱한다", () => {
      const data = {
        callId: validUuid,
        orderId: validUuid,
        pickupNumber: 5,
        calledAt: validIso,
        cooldownSeconds: 120,
      };

      const result = CallStaffResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("cooldownSeconds가 음수이면 거부한다", () => {
      const data = {
        callId: validUuid,
        orderId: validUuid,
        pickupNumber: 5,
        calledAt: validIso,
        cooldownSeconds: -1,
      };

      const result = CallStaffResponseSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("StaffCallDtoSchema", () => {
    it("미확인 직원 호출 DTO를 정상 파싱한다", () => {
      const data = {
        id: validUuid,
        orderId: validUuid,
        pickupNumber: 12,
        calledAt: validIso,
        acknowledgedAt: null,
        acknowledgedBy: null,
      };

      const result = StaffCallDtoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("확인 완료된 직원 호출 DTO를 정상 파싱한다", () => {
      const data = {
        id: validUuid,
        orderId: validUuid,
        pickupNumber: 12,
        calledAt: validIso,
        acknowledgedAt: validIso,
        acknowledgedBy: validUuid,
      };

      const result = StaffCallDtoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe("StaffCallsListResponseSchema", () => {
    it("직원 호출 목록 응답을 정상 파싱한다", () => {
      const data = {
        calls: [
          {
            id: validUuid,
            orderId: validUuid,
            pickupNumber: 12,
            calledAt: validIso,
            acknowledgedAt: null,
            acknowledgedBy: null,
          },
        ],
        unacknowledgedCount: 1,
      };

      const result = StaffCallsListResponseSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
