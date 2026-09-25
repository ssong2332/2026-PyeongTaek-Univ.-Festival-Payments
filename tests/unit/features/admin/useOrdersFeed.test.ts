import { describe, expect, it } from "vitest";
import {
    deriveUnacknowledgedCount,
    mergeOrderUpdate,
} from "@/features/admin/useOrdersFeed";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

function createSampleOrder(overrides: Partial<AdminOrderDto> = {}): AdminOrderDto {
    return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        pickupNumber: 101,
        status: "pending",
        paymentMethod: "transfer",
        transferMethod: "bank",
        totalAmount: 15000,
        items: [],
        createdAt: "2026-09-25T10:00:00.000Z",
        updatedAt: "2026-09-25T10:00:00.000Z",
        acknowledgedAt: null,
        transferReportedAt: null,
        cancelRequestedAt: null,
        cancelRejectedAt: null,
        paidAt: null,
        cookingStartedAt: null,
        completedAt: null,
        closedAt: null,
        refundChannel: null,
        lastReason: null,
        availableActions: ["confirm_payment", "cancel"],
        ...overrides,
    };
}

describe("T-15 / ADR-0003: useOrdersFeed 로직 검증", () => {
    describe("deriveUnacknowledgedCount", () => {
        it("미확인(acknowledgedAt == null)이면서 pending, paid, cooking 상태인 주문만 카운트한다", () => {
            const map = new Map<string, AdminOrderDto>();
            map.set("1", createSampleOrder({ id: "1", status: "pending", acknowledgedAt: null }));
            map.set("2", createSampleOrder({ id: "2", status: "paid", acknowledgedAt: null }));
            map.set("3", createSampleOrder({ id: "3", status: "cooking", acknowledgedAt: null }));
            // 이미 확인된 주문 -> 제외
            map.set("4", createSampleOrder({ id: "4", status: "pending", acknowledgedAt: "2026-09-25T10:01:00Z" }));
            // 터미널 상태 -> 미확인이더라도 제외
            map.set("5", createSampleOrder({ id: "5", status: "completed", acknowledgedAt: null }));
            map.set("6", createSampleOrder({ id: "6", status: "cancelled", acknowledgedAt: null }));

            const count = deriveUnacknowledgedCount(map);
            expect(count).toBe(3);
        });
    });

    describe("mergeOrderUpdate (ADR-0003)", () => {
        it("새로운 updatedAt을 가진 UPDATE 이벤트가 오면 주문을 최신으로 갱신한다", () => {
            const current = createSampleOrder({
                status: "pending",
                updatedAt: "2026-09-25T10:00:00.000Z",
            });

            const updated = mergeOrderUpdate(current, {
                status: "paid",
                paidAt: "2026-09-25T10:05:00.000Z",
                updatedAt: "2026-09-25T10:05:00.000Z",
            });

            expect(updated.status).toBe("paid");
            expect(updated.paidAt).toBe("2026-09-25T10:05:00.000Z");
            expect(updated.updatedAt).toBe("2026-09-25T10:05:00.000Z");
            // availableActions가 상태에 맞게 재계산되었는지 확인
            expect(updated.availableActions).toEqual(["start_cooking", "cancel"]);
        });

        it("ADR-0003: 지연/역순 도착으로 이전 updatedAt을 가진 UPDATE 이벤트가 오면 무시한다", () => {
            const current = createSampleOrder({
                status: "paid",
                updatedAt: "2026-09-25T10:05:00.000Z",
            });

            // 오래된 과거 이벤트 도착 (10:02)
            const staleUpdate = mergeOrderUpdate(current, {
                status: "pending",
                updatedAt: "2026-09-25T10:02:00.000Z",
            });

            // 기존 값(paid) 유지
            expect(staleUpdate.status).toBe("paid");
            expect(staleUpdate.updatedAt).toBe("2026-09-25T10:05:00.000Z");
        });
    });
});
