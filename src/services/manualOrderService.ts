import { AppError } from "@/lib/api/errors";
import type { ManualOrderRequest, ManualOrderResponse } from "@/lib/dto/manualOrder";
import type { Clock, ManualOrderRepository } from "./ports";

// 종이 주문 시각은 미래일 수 없다. 기기 시계 차이를 감안해 5분까지는 받는다(DB 함수와 같은 기준).
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const systemClock: Clock = { now: () => new Date() };

// Architecture "POST /api/admin/manual-orders" · PRD F-34 (T-28, DECISIONS #62). 관리자 인증은 Route Handler가 한다.
// 가격 계산·재고 차감(0에서 멈춤)·상태 이력·멱등 처리는 DB 함수가 한 트랜잭션으로 한다.
export async function createManualOrder(
    request: ManualOrderRequest,
    deps: { manualOrderRepository: ManualOrderRepository; adminId: string; clock?: Clock },
): Promise<ManualOrderResponse> {
    const now = (deps.clock ?? systemClock).now().getTime();
    if (Date.parse(request.manualOrderedAt) > now + FUTURE_TOLERANCE_MS) {
        throw new AppError("VALIDATION_ERROR", 400, [{ path: ["manualOrderedAt"], message: "must not be in the future" }]);
    }

    return deps.manualOrderRepository.createManualOrder({
        idempotencyKey: request.idempotencyKey,
        paymentMethod: request.paymentMethod,
        manualOrderedAt: request.manualOrderedAt,
        manualNumber: request.manualNumber,
        actorId: deps.adminId,
        items: request.items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            optionIds: item.optionIds,
        })),
    });
}
