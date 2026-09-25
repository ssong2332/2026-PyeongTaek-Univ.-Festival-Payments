import type { AdminOrderRepository, OrderListFilter } from "./ports";
import type { AdminOrderDto, AdminOrdersResponse } from "@/lib/dto/adminOrder";
import { AppError } from "@/lib/api/errors";

export async function listAdminOrders(
    repository: AdminOrderRepository,
    filter?: OrderListFilter,
): Promise<AdminOrdersResponse> {
    const orders = await repository.list(filter);

    const unacknowledgedCount = orders.filter(
        (o) => o.acknowledgedAt === null && ["pending", "paid", "cooking"].includes(o.status),
    ).length;

    return {
        orders,
        unacknowledgedCount,
    };
}

export async function getAdminOrderById(
    repository: AdminOrderRepository,
    id: string,
): Promise<AdminOrderDto> {
    const order = await repository.findById(id);
    if (!order) {
        throw new AppError("NOT_FOUND", 404);
    }
    return order;
}

export async function acknowledgeAdminOrder(
    repository: AdminOrderRepository,
    id: string,
    actorId?: string,
): Promise<AdminOrderDto> {
    const order = await repository.findById(id);
    if (!order) {
        throw new AppError("NOT_FOUND", 404);
    }

    // 이미 확인된 주문이면 기존 주문 반환 (멱등)
    if (order.acknowledgedAt !== null) {
        return order;
    }

    return await repository.acknowledge(id, actorId);
}
