export const ORDER_STATUSES = [
    "pending",
    "paid",
    "cooking",
    "completed",
    "cancelled",
    "refunded",
    "expired",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// T-53 / PR #38: transfer_method 컬럼 및 타입 삭제 (현금/계좌이체 2종만 지원)
export const REFUND_CHANNELS = ["cash", "bank"] as const;
export type RefundChannel = (typeof REFUND_CHANNELS)[number];

export const TRANSITION_ACTIONS = [
    "confirm_payment",
    "confirm_cash",
    "start_cooking",
    "complete",
    "auto_complete",
    "cancel",
    "refund",
    "expire",
] as const;

export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

// 관리자 API(POST /api/admin/orders/[id]/transition)가 요청으로 받을 수 있는 action.
// auto_complete·expire는 시스템(스윕) 전용이라 제외한다 — 요청 검증 단계에서 400으로 막아
// API 계약과 validation 결과를 일치시킨다(서비스 계층 차단과 별개).
// satisfies로 TRANSITION_ACTIONS의 부분집합임을 컴파일 시점에 보장하고,
// 상태 머신의 actor: "admin" 규칙과 일치하는지는 stateMachine 단위 테스트가 확인한다.
export const ADMIN_TRANSITION_ACTIONS = [
    "confirm_payment",
    "confirm_cash",
    "start_cooking",
    "complete",
    "cancel",
    "refund",
] as const satisfies readonly TransitionAction[];

export type AdminTransitionAction = (typeof ADMIN_TRANSITION_ACTIONS)[number];

export const ACTOR_TYPES = ["admin", "system", "customer"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
