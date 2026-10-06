import { describe, expect, test, vi } from "vitest";
import { AppError } from "@/lib/api/errors";
import type { ManualOrderRequest, ManualOrderResponse } from "@/lib/dto/manualOrder";
import { createManualOrder } from "@/services/manualOrderService";
import type { ManualOrderRepository } from "@/services/ports";

// T-28 수기 주문 저장 서비스. 저장·가격·재고·멱등은 DB 함수가 맡고, 서비스는 미래 시각을 막고 관리자 id를 붙인다.
const NOW = new Date("2026-10-07T03:00:00.000Z");
const clock = { now: () => NOW };
const request: ManualOrderRequest = {
    idempotencyKey: "3f0e7b3a-5c1d-4e6f-8a9b-0c1d2e3f4a5b",
    paymentMethod: "transfer",
    manualOrderedAt: "2026-10-07T02:30:00.000Z",
    manualNumber: 3,
    items: [{ menuItemId: "11111111-1111-1111-1111-111111111111", quantity: 2, optionIds: [] }],
};
const saved: ManualOrderResponse = {
    orderId: "22222222-2222-2222-2222-222222222222", manualNumber: 3, displayNumber: "M-003",
    status: "completed", paymentMethod: "transfer", totalAmount: 4000,
    manualOrderedAt: request.manualOrderedAt, createdAt: NOW.toISOString(), created: true, stockShortages: [],
};

function repository(result: ManualOrderResponse | Error = saved) {
    const createManualOrder = vi.fn<ManualOrderRepository["createManualOrder"]>(async () => {
        if (result instanceof Error) throw result;
        return result;
    });
    return { createManualOrder };
}

describe("createManualOrder", () => {
    test("요청과 관리자 id를 저장소에 넘기고 결과를 그대로 돌려준다", async () => {
        const manualOrderRepository = repository();

        const result = await createManualOrder(request, { manualOrderRepository, adminId: "admin-1", clock });

        expect(result).toEqual(saved);
        expect(manualOrderRepository.createManualOrder).toHaveBeenCalledExactlyOnceWith({ ...request, actorId: "admin-1" });
    });

    test("종이 주문 시각이 5분 넘게 미래면 400 — 저장소를 부르지 않는다", async () => {
        const manualOrderRepository = repository();
        const future = { ...request, manualOrderedAt: "2026-10-07T03:05:01.000Z" };

        await expect(createManualOrder(future, { manualOrderRepository, adminId: "admin-1", clock }))
            .rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
        expect(manualOrderRepository.createManualOrder).not.toHaveBeenCalled();
    });

    test.each(["2026-10-07T03:05:00.000Z", "2026-10-07T03:00:00.000Z", "2026-10-06T03:00:00.000Z"])(
        "시각 %s 는 받는다(기기 시계 차이 5분까지 허용, 과거는 제한 없음)",
        async (manualOrderedAt) => {
            const manualOrderRepository = repository();

            await createManualOrder({ ...request, manualOrderedAt }, { manualOrderRepository, adminId: "admin-1", clock });

            expect(manualOrderRepository.createManualOrder).toHaveBeenCalledTimes(1);
        },
    );

    test("저장소의 오류(수기 번호 중복 등)는 그대로 올린다", async () => {
        const manualOrderRepository = repository(new AppError("MANUAL_NUMBER_TAKEN", 409, { manualNumber: 3 }));

        await expect(createManualOrder(request, { manualOrderRepository, adminId: "admin-1", clock }))
            .rejects.toMatchObject({ code: "MANUAL_NUMBER_TAKEN", status: 409, details: { manualNumber: 3 } });
    });
});
