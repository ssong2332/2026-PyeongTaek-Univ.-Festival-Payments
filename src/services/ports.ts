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

export interface RateLimitRepository {
    consume(
        scope: string,
        key: string,
        limit: number,
        windowSeconds: number,
        now?: Date,
    ): Promise<boolean>;
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

export interface OrderItemDetail {
    name: string;
    quantity: number;
    options: string[];
    lineTotal: number;
}

export interface OrderByTokenResult {
    id: string;
    pickupNumber: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    totalAmount: number;
    items: OrderItemDetail[];
    createdAt: string;
    transferReportedAt: string | null;
    cancelRequestedAt: string | null;
    cancelRejectedAt: string | null;
}

export interface OrderRepository {
    // rpc('create_order'). OUT_OF_STOCK·MENU_UNAVAILABLE·INVALID_OPTION은 AppError(409)로 바꿔 던진다.
    createOrder(input: CreateOrderRequest): Promise<CreateOrderResponse>;
    // 같은 멱등키 주문이 있으면 created=false 응답, 없으면 null (ADR-0009 ①).
    findByIdempotencyKey(key: string): Promise<CreateOrderResponse | null>;
    findById(id: string): Promise<OrderForTransition | null>;
    // CAS 실패 시 AppError("STATE_CHANGED", 409)를 던진다.
    transition(command: TransitionCommand): Promise<OrderForTransition>;
    // 상태 토큰으로 주문 및 항목 조회 (T-11 고객 상태 페이지, T-32 송금 신고 재사용). 없으면 null
    findByToken(token: string): Promise<OrderByTokenResult | null>;
    // 내 앞의 대기 주문 수(createdAt 제공 시) 또는 전체 대기 주문 수(미제공/null 시). status in ('pending','paid','cooking')
    countWaitingBefore(createdAt?: string | null): Promise<number>;
}

// 메뉴 조회(GET /api/menu). 저장소는 거르지 않은 전체를 돌려주고, 비활성 제외·언어 폴백·품절 파생은 menuService가 한다.
export interface MenuNameTranslation {
    locale: string;
    name: string;
}

export interface MenuItemTranslation extends MenuNameTranslation {
    description: string | null;
}

export interface MenuOptionRecord {
    id: string;
    extraPrice: number;
    sortOrder: number;
    isActive: boolean;
    translations: MenuNameTranslation[];
}

export interface MenuOptionGroupRecord {
    id: string;
    minSelect: number;
    maxSelect: number;
    sortOrder: number;
    isActive: boolean;
    translations: MenuNameTranslation[];
    options: MenuOptionRecord[];
}

export interface MenuItemRecord {
    id: string;
    basePrice: number;
    stock: number;
    isSoldOutManual: boolean;
    isActive: boolean;
    sortOrder: number;
    imageUrl: string | null;
    translations: MenuItemTranslation[];
    optionGroups: MenuOptionGroupRecord[];
}

export interface MenuRepository {
    // 비활성 메뉴·그룹·옵션과 모든 언어의 번역을 포함한 전체.
    listMenuItems(): Promise<MenuItemRecord[]>;
}
