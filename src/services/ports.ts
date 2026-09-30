import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { OrderStatus, PaymentMethod, RefundChannel, TransitionAction } from "@/domain/order/status";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";

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

export interface SweepResult {
    expired: number;
    completed: number;
}

export interface SweepRepository {
    sweep(): Promise<SweepResult>;
}

// 지금은 상태 전환(T-14)에 필요한 필드만 둔다. 다른 서비스 Task가 필요한 필드·메서드를 추가한다.
export type OrderForTransition = {
    id: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
};

// DB 함수 transition_order 인자와 1:1 (Architecture "DB 함수" 표).
export type TransitionCommand = {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    action: TransitionAction;
    actorType: "admin" | "system";
    actorId: string | null;
    reason: string | null;
    refundChannel: RefundChannel | null;
};

export interface OrderRepository {
    // rpc('create_order'). OUT_OF_STOCK·MENU_UNAVAILABLE·INVALID_OPTION은 AppError(409)로 바꿔 던진다.
    createOrder(input: CreateOrderRequest): Promise<CreateOrderResponse>;
    // 같은 멱등키 주문이 있으면 created=false 응답, 없으면 null (ADR-0009 ①).
    findByIdempotencyKey(key: string): Promise<CreateOrderResponse | null>;
    findById(id: string): Promise<OrderForTransition | null>;
    // CAS 실패 시 AppError("STATE_CHANGED", 409)를 던진다.
    transition(command: TransitionCommand): Promise<OrderForTransition>;
}
