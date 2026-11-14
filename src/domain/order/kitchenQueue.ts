import type { OrderStatus } from "@/domain/order/status";

// 조리 화면은 한 번에 200건씩, 최대 1000건까지 불러온다(Supabase max_rows = 1000).
export const KITCHEN_PAGE_SIZE = 200;
export const KITCHEN_MAX_LIMIT = 1000;

export interface KitchenQueueOrder {
    id: string;
    status: OrderStatus;
    createdAt: string;
    paidAt: string | null;
    cookingStartedAt: string | null;
}

// 경과 시간 표시 기준 시각. 조리 시작 시각이 없는 옛 주문은 결제 시각, 주문 시각 순으로 대신한다.
export function cookingSince(order: KitchenQueueOrder): string {
    return order.cookingStartedAt ?? order.paidAt ?? order.createdAt;
}

const instant = (value: string) => Date.parse(value);

// 조리 화면 순서. 서버 조회(GET /api/admin/orders?scope=kitchen)와 같은 기준이어야 상한에 걸려 빠지는 주문이
// 화면에서도 맨 뒤(가장 최근에 조리를 시작한 주문)가 된다:
// 조리 시작 시각 오래된 순(없으면 맨 앞) → 주문 생성 시각 → id.
export function compareKitchenOrder(a: KitchenQueueOrder, b: KitchenQueueOrder): number {
    if (a.cookingStartedAt === null || b.cookingStartedAt === null) {
        if (a.cookingStartedAt !== b.cookingStartedAt) return a.cookingStartedAt === null ? -1 : 1;
    } else {
        const byStart = instant(a.cookingStartedAt) - instant(b.cookingStartedAt);
        if (byStart !== 0) return byStart;
    }
    const byCreated = instant(a.createdAt) - instant(b.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function selectCookingOrders<T extends KitchenQueueOrder>(orders: readonly T[]): T[] {
    return orders.filter((order) => order.status === "cooking").sort(compareKitchenOrder);
}
