import type { AdminOrderDto } from "@/lib/dto/adminOrder";
import type { OrderStatus, PaymentMethod, RefundChannel, TransitionAction } from "@/domain/order/status";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";
import type { ManualOrderResponse } from "@/lib/dto/manualOrder";
import type { Shift, ShiftInput } from "@/domain/shift/schedule";

export interface ShiftRepository {
    list(): Promise<Shift[]>;
    create(input: ShiftInput): Promise<Shift>;
    update(id: string, input: ShiftInput): Promise<Shift>;
    remove(id: string): Promise<void>;
}

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
    // 송금 신고 시각 최초 1회 기록(T-32, F-43). 결제대기·계좌이체·미신고일 때만 기록해 그 시각(DB 문자열)을, 아니면 null.
    setTransferReported(id: string): Promise<string | null>;
    // 고객 취소 요청 시각 최초 1회 기록(T-35, F-45). 결제대기·결제확인이고 요청·거절 기록이 없을 때만 기록해 그 시각(DB 문자열)을, 아니면 null.
    setCancelRequested(id: string): Promise<string | null>;
    // 취소 요청 거절(T-35, F-18): 결제대기·결제확인이고 요청됨·미거절일 때만 거절 시각을 기록하고 이력 1행(cancel_request_reject)을 남긴다.
    // 조건에 맞는 주문이 없으면 false. 이력을 남기지 못하면 거절 시각을 되돌리고 AppError("INTERNAL_ERROR", 500)를 던진다.
    rejectCancelRequest(id: string, actorId: string, reason: string): Promise<boolean>;
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
    isRecommended: boolean;
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

// 관리자 메뉴·재고 관리(T-20, F-25·F-26·F-27). 쓰기는 서버(service_role)에서만 한다(0003 RLS — authenticated는 SELECT만).
// 번역은 언어별 한 행을 넣거나 고친다(upsert). description이 undefined면 기존 설명을 그대로 두고, null이면 지운다.
export interface MenuItemPatch {
    basePrice?: number;
    stock?: number;
    isRecommended?: boolean;
    isSoldOutManual?: boolean;
    isActive?: boolean;
}

export interface AdminMenuCreateInput {
    basePrice: number;
    stock: number;
    sortOrder: number;
    translations: MenuTranslationWrite[];
    optionGroups: Array<{
        minSelect: number;
        maxSelect: number;
        sortOrder: number;
        translations: NameTranslationWrite[];
        options: Array<{
            extraPrice: number;
            sortOrder: number;
            translations: NameTranslationWrite[];
        }>;
    }>;
}

export interface MenuTranslationWrite {
    locale: string;
    name: string;
    description?: string | null;
}

export interface NameTranslationWrite {
    locale: string;
    name: string;
}

export interface OptionGroupPatch {
    minSelect?: number;
    maxSelect?: number;
    isActive?: boolean;
}

export interface OptionPatch {
    extraPrice?: number;
    isActive?: boolean;
}

export interface OptionGroupRef {
    menuItemId: string;
    minSelect: number;
    maxSelect: number;
}

export interface AdminMenuRepository {
    // 비활성 포함 전체(GET /api/admin/menus).
    listMenuItems(): Promise<MenuItemRecord[]>;
    getMenuItem(id: string): Promise<MenuItemRecord | null>;
    // T-37 신규 메뉴와 옵션 구조를 생성한다. 실패 시 구현체가 생성 중인 메뉴를 정리한다.
    createMenuItem(input: AdminMenuCreateInput): Promise<string>;
    // 값이 없는 칸은 건드리지 않고 updated_at만 갱신한다. 메뉴가 없으면 false.
    updateMenuItem(id: string, patch: MenuItemPatch): Promise<boolean>;
    upsertMenuTranslation(menuItemId: string, translation: MenuTranslationWrite): Promise<void>;
    findOptionGroup(id: string): Promise<OptionGroupRef | null>;
    updateOptionGroup(id: string, patch: OptionGroupPatch): Promise<void>;
    upsertOptionGroupTranslation(optionGroupId: string, translation: NameTranslationWrite): Promise<void>;
    // 옵션이 속한 메뉴 id. 옵션이 없으면 null.
    findOptionMenuItemId(id: string): Promise<string | null>;
    updateOption(id: string, patch: OptionPatch): Promise<void>;
    upsertOptionTranslation(optionId: string, translation: NameTranslationWrite): Promise<void>;
}

// 수기 주문 사후 입력(T-28, F-34). 저장은 DB 함수 create_manual_order 한 번(주문·이력·재고가 한 트랜잭션).
export interface ManualOrderInput {
    idempotencyKey: string;
    paymentMethod: PaymentMethod;
    manualOrderedAt: string;
    manualNumber: number;
    actorId: string;
    items: { menuItemId: string; quantity: number; optionIds: string[] }[];
}

export interface ManualOrderRepository {
    // 같은 멱등키 재요청이면 기존 주문을 created=false로 돌려준다. 수기 번호 중복은 409 MANUAL_NUMBER_TAKEN.
    createManualOrder(input: ManualOrderInput): Promise<ManualOrderResponse>;
}
