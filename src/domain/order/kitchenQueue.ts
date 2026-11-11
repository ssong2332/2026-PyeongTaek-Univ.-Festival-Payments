import type { OrderStatus } from "@/domain/order/status";

export interface KitchenQueueOrder {
    status: OrderStatus;
    pickupNumber: number;
    createdAt: string;
    paidAt: string | null;
    cookingStartedAt: string | null;
}

// 조리를 기다린 기준 시각. 조리 시작 시각이 없는 옛 주문은 결제 시각, 주문 시각 순으로 대신한다.
export function cookingSince(order: KitchenQueueOrder): string {
    return order.cookingStartedAt ?? order.paidAt ?? order.createdAt;
}

// 조리 화면 순서: 조리중 주문만, 오래된 주문이 맨 앞. 같은 시각이면 픽업 번호가 빠른 주문이 앞이다.
export function selectCookingOrders<T extends KitchenQueueOrder>(orders: readonly T[]): T[] {
    return orders
        .filter((order) => order.status === "cooking")
        .sort((a, b) => new Date(cookingSince(a)).getTime() - new Date(cookingSince(b)).getTime() || a.pickupNumber - b.pickupNumber);
}
