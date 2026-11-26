import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toAdminOrderDto } from "@/infra/repositories/adminOrderRepository";
import { AdminOrderDtoSchema } from "@/lib/dto/adminOrder";

describe("toAdminOrderDto (T-55 pendingSince 및 관리자 DTO 매핑)", () => {
    const baseRow = {
        id: "a0000000-0000-4000-a000-000000000001",
        pickup_number: 101,
        status: "pending" as const,
        payment_method: "transfer" as const,
        total_amount: 5000,
        created_at: "2026-10-07T01:00:00.000000+00:00",
        updated_at: "2026-10-07T01:00:00.000000+00:00",
        acknowledged_at: null,
        transfer_reported_at: null,
        cancel_requested_at: null,
        cancel_rejected_at: null,
        paid_at: null,
        cooking_started_at: null,
        completed_at: null,
        closed_at: null,
        refund_channel: null,
        source: "customer" as const,
        manual_number: null,
        manual_ordered_at: null,
        order_items: [
            {
                menu_name_ko: "단팥호떡",
                quantity: 2,
                line_total: 5000,
                order_item_options: [
                    { option_name_ko: "치즈 추가", extra_price: 500 },
                ],
            },
        ],
        order_status_history: [
            { reason: "초기 주문", created_at: "2026-10-07T01:00:00.000000+00:00" },
            { reason: "입금 미확인으로 되돌림", created_at: "2026-10-07T01:10:00.000000+00:00" },
        ],
    };

    it("pending_since가 비-null 시각이면 DTO의 pendingSince에 해당 문자열이 매핑된다", () => {
        const row = {
            ...baseRow,
            pending_since: "2026-10-07T01:10:00.000000+00:00",
        };
        const dto = toAdminOrderDto(row);

        expect(dto.pendingSince).toBe("2026-10-07T01:10:00.000000+00:00");
        expect(dto.lastReason).toBe("입금 미확인으로 되돌림");
        expect(AdminOrderDtoSchema.safeParse(dto).success).toBe(true);
    });

    it("pending_since가 null이거나 생략(undefined)되었을 때 DTO의 pendingSince는 null이다", () => {
        const rowWithNull = {
            ...baseRow,
            pending_since: null,
        };
        const dtoNull = toAdminOrderDto(rowWithNull);
        expect(dtoNull.pendingSince).toBeNull();
        expect(AdminOrderDtoSchema.safeParse(dtoNull).success).toBe(true);

        const rowWithUndefined = {
            ...baseRow,
            pending_since: undefined,
        };
        const dtoUndefined = toAdminOrderDto(rowWithUndefined);
        expect(dtoUndefined.pendingSince).toBeNull();
        expect(AdminOrderDtoSchema.safeParse(dtoUndefined).success).toBe(true);
    });

    it.each([
        ["계좌이체 결제대기", "pending", "transfer", "confirm_payment"],
        ["현금 결제대기", "pending", "cash", "confirm_cash"],
        ["기존 결제확인", "paid", "transfer", "start_cooking"],
    ] as const)("%s 목록 DTO는 취소 요청 대기·거절에 맞춰 조리 진입 버튼을 갱신한다",
        (_label, status, paymentMethod, action) => {
            const row = { ...baseRow, status, payment_method: paymentMethod };
            const before = toAdminOrderDto(row);
            const requested = toAdminOrderDto({
                ...row, cancel_requested_at: "2026-10-07T01:05:00.000Z", cancel_rejected_at: null,
            });
            const rejected = toAdminOrderDto({
                ...row, cancel_requested_at: "2026-10-07T01:05:00.000Z",
                cancel_rejected_at: "2026-10-07T01:06:00.000Z",
            });
            expect(before.availableActions).toContain(action);
            expect(requested.availableActions).not.toContain(action);
            expect(requested.availableActions).toContain("cancel");
            expect(rejected.availableActions).toContain(action);
        });
});
