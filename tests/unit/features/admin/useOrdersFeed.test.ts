import { describe, expect, it } from "vitest";
import {
    deriveUnacknowledgedCount,
    mergeOrderUpdate,
    mergeOrdersSnapshot,
    mapPayloadToOrderPatch,
    pickNewerOrder,
} from "@/features/admin/useOrdersFeed";
import type { AdminOrderDto } from "@/lib/dto/adminOrder";

function createSampleOrder(overrides: Partial<AdminOrderDto> = {}): AdminOrderDto {
    return {
        id: "550e8400-e29b-41d4-a716-446655440000",
        pickupNumber: 101,
        status: "pending",
        paymentMethod: "transfer",
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

    describe("mapPayloadToOrderPatch", () => {
        it("Supabase Realtime의 snake_case DB 페이로드를 camelCase DTO 필드로 정확히 변환한다", () => {
            const rawPayload = {
                id: "550e8400-e29b-41d4-a716-446655440000",
                pickup_number: 105,
                status: "paid",
                payment_method: "transfer",
                total_amount: 20000,
                acknowledged_at: "2026-09-25T10:10:00.000Z",
                transfer_reported_at: "2026-09-25T10:08:00.000Z",
                cancel_requested_at: "2026-09-25T10:09:00.000Z",
                cancel_rejected_at: null,
                paid_at: "2026-09-25T10:10:00.000Z",
                cooking_started_at: null,
                completed_at: null,
                closed_at: null,
                refund_channel: "bank",
                updated_at: "2026-09-25T10:10:00.000Z",
            };

            const patch = mapPayloadToOrderPatch(rawPayload);

            expect(patch.pickupNumber).toBe(105);
            expect(patch.status).toBe("paid");
            expect(patch.paymentMethod).toBe("transfer");
            expect(patch.totalAmount).toBe(20000);
            expect(patch.acknowledgedAt).toBe("2026-09-25T10:10:00.000Z");
            expect(patch.transferReportedAt).toBe("2026-09-25T10:08:00.000Z");
            expect(patch.cancelRequestedAt).toBe("2026-09-25T10:09:00.000Z");
            expect(patch.paidAt).toBe("2026-09-25T10:10:00.000Z");
            expect(patch.refundChannel).toBe("bank");
            expect(patch.updatedAt).toBe("2026-09-25T10:10:00.000Z");
        });
    });

    describe("mergeOrderUpdate (ADR-0003)", () => {
        it("다른 관리자 세션이 확인(acknowledged_at)한 Realtime DB 이벤트가 오면 acknowledgedAt이 반영되어 미확인 수가 감소한다", () => {
            const current = createSampleOrder({
                id: "1",
                status: "pending",
                acknowledgedAt: null,
                updatedAt: "2026-09-25T10:00:00.000Z",
            });

            const map = new Map<string, AdminOrderDto>();
            map.set("1", current);
            expect(deriveUnacknowledgedCount(map)).toBe(1);

            // 다른 관리자가 acknowledge 호출하여 DB에서 날아온 Realtime UPDATE 페이로드
            const dbPayload = {
                id: "1",
                acknowledged_at: "2026-09-25T10:05:00.000Z",
                updated_at: "2026-09-25T10:05:00.000Z",
            };

            const updated = mergeOrderUpdate(current, dbPayload);
            map.set("1", updated);

            expect(updated.acknowledgedAt).toBe("2026-09-25T10:05:00.000Z");
            expect(deriveUnacknowledgedCount(map)).toBe(0);
        });

        it("새로운 updatedAt을 가진 UPDATE 이벤트가 오면 주문을 최신으로 갱신한다", () => {
            const current = createSampleOrder({
                status: "pending",
                updatedAt: "2026-09-25T10:00:00.000Z",
            });

            const updated = mergeOrderUpdate(current, {
                status: "paid",
                paid_at: "2026-09-25T10:05:00.000Z",
                updated_at: "2026-09-25T10:05:00.000Z",
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
                updated_at: "2026-09-25T10:02:00.000Z",
            });

            // 기존 값(paid) 유지
            expect(staleUpdate.status).toBe("paid");
            expect(staleUpdate.updatedAt).toBe("2026-09-25T10:05:00.000Z");
        });
    });
    describe("pickNewerOrder (상세·목록 조회 결과에도 ADR-0003 적용)", () => {
        const cooking = createSampleOrder({ status: "cooking", updatedAt: "2026-09-25T10:05:00.000Z" });
        const pending = createSampleOrder({ status: "pending", updatedAt: "2026-09-25T10:00:00.000Z" });

        it("지금 값이 없으면 받은 주문을 쓴다", () => {
            expect(pickNewerOrder(undefined, pending)).toBe(pending);
        });

        it("받은 주문이 더 오래되면(늦게 도착한 pending) 지금 값(cooking)을 유지한다", () => {
            expect(pickNewerOrder(cooking, pending)).toBe(cooking);
        });

        it("받은 주문이 더 새로우면 받은 주문으로 바꾼다", () => {
            expect(pickNewerOrder(pending, cooking)).toBe(cooking);
        });

        it("updatedAt이 같으면 받은 주문(서버 전체 값)을 쓴다 — mergeOrderUpdate와 같은 규칙", () => {
            const acknowledged = { ...cooking, acknowledgedAt: "2026-09-25T10:05:00.000Z" };
            expect(pickNewerOrder(cooking, acknowledged)).toBe(acknowledged);
        });
    });

    describe("mergeOrdersSnapshot (초기 로드·새로고침 결과 합치기)", () => {
        const at = (minute: number) => `2026-09-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
        const map = (...orders: AdminOrderDto[]) => new Map(orders.map((order) => [order.id, order]));

        it("목록이 실시간으로 받은 값보다 오래되면 실시간 값을 유지하고, 더 새로우면 목록 값을 쓴다", () => {
            const current = map(
                createSampleOrder({ id: "a", status: "cooking", updatedAt: at(5) }),
                createSampleOrder({ id: "b", status: "pending", updatedAt: at(1) }),
            );
            const snapshot = map(
                createSampleOrder({ id: "a", status: "pending", updatedAt: at(0) }),
                createSampleOrder({ id: "b", status: "paid", updatedAt: at(3) }),
            );
            const merged = mergeOrdersSnapshot(current, snapshot, () => false);
            expect(merged.get("a")?.status).toBe("cooking");
            expect(merged.get("b")?.status).toBe("paid");
        });

        it("목록에 없는 주문은 조회 중 실시간으로 받은 것만 남기고 나머지는 뺀다", () => {
            const current = map(
                createSampleOrder({ id: "live", updatedAt: at(4) }),
                createSampleOrder({ id: "old", updatedAt: at(0) }),
            );
            const merged = mergeOrdersSnapshot(current, map(), (id) => id === "live");
            expect([...merged.keys()]).toEqual(["live"]);
        });
    });
});
