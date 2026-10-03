import { z } from "zod";

/**
 * T-27 / F-33 직원 호출 DTO 스키마
 */

// 고객 직원 호출 성공 응답
export const CallStaffResponseSchema = z.object({
  callId: z.guid(),
  orderId: z.guid(),
  pickupNumber: z.number().int().positive(),
  calledAt: z.iso.datetime(),
  cooldownSeconds: z.number().int().nonnegative(),
});

export type CallStaffResponse = z.infer<typeof CallStaffResponseSchema>;

// 관리자 직원 호출 개별 항목 DTO
export const StaffCallDtoSchema = z.object({
  id: z.guid(),
  orderId: z.guid(),
  pickupNumber: z.number().int().positive(),
  calledAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
  acknowledgedBy: z.guid().nullable(),
});

export type StaffCallDto = z.infer<typeof StaffCallDtoSchema>;

// 관리자 직원 호출 목록 응답
export const StaffCallsListResponseSchema = z.object({
  calls: z.array(StaffCallDtoSchema),
  unacknowledgedCount: z.number().int().nonnegative(),
});

export type StaffCallsListResponse = z.infer<typeof StaffCallsListResponseSchema>;
