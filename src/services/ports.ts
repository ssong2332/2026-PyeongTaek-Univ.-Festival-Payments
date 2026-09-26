import type { OrderStatus, PaymentMethod, RefundChannel, TransitionAction } from "@/domain/order/status";
import type { CreateOrderRequest, CreateOrderResponse } from "@/lib/dto/order";

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

// 송금 신고(F-43) 결과. 판단은 한 번의 조건부 갱신으로 해서 연타·동시 요청에도 최초 시각만 남는다.
export type TransferReportResult =
    | { outcome: "reported"; transferReportedAt: string }
    | { outcome: "already_reported"; transferReportedAt: string }
    | { outcome: "not_allowed" }
    | { outcome: "not_found" };

export interface OrderRepository {
    // rpc('create_order'). OUT_OF_STOCK·MENU_UNAVAILABLE·INVALID_OPTION은 AppError(409)로 바꿔 던진다.
    createOrder(input: CreateOrderRequest): Promise<CreateOrderResponse>;
    // 같은 멱등키 주문이 있으면 created=false 응답, 없으면 null (ADR-0009 ①).
    findByIdempotencyKey(key: string): Promise<CreateOrderResponse | null>;
    findById(id: string): Promise<OrderForTransition | null>;
    // CAS 실패 시 AppError("STATE_CHANGED", 409)를 던진다.
    transition(command: TransitionCommand): Promise<OrderForTransition>;
    // 결제대기·계좌이체·미신고 주문만 at으로 기록. 그 외는 이미 신고됨/불가/없음을 돌려준다(T-32).
    reportTransfer(token: string, at: Date): Promise<TransferReportResult>;
}
