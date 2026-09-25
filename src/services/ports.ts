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

export interface SettingsRepository {
    get(key: string): Promise<string | null>;
    getAll(): Promise<Record<string, string>>;
    getByPrefix(prefix: string): Promise<Record<string, string>>;
    set?(key: string, value: string, updatedBy?: string): Promise<void>;
    setMany?(settings: Record<string, string>, updatedBy?: string): Promise<void>;
}

export interface Clock {
    now(): Date;
}
