import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { OrderStatus } from "@/domain/order/status";

export interface OrderListFilter {
    date?: string;
    status?: OrderStatus[];
    pickupNumber?: number;
}

export interface AdminOrderRepository {
    findById(id: string): Promise<AdminOrderDto | null>;
    list(filter?: OrderListFilter): Promise<AdminOrderDto[]>;
    acknowledge(id: string, actorId?: string): Promise<AdminOrderDto>;
}
