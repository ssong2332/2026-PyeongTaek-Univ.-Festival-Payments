export type TransitionErrorCode =
    | "REASON_REQUIRED"
    | "REFUND_CHANNEL_REQUIRED"
    | "INVALID_TRANSITION"
    | "STATE_CHANGED";

const errorMessages: Record<TransitionErrorCode, string> = {
    REASON_REQUIRED: "취소·환불 사유가 필요합니다. 사유를 입력한 뒤 다시 시도해 주세요.",
    REFUND_CHANNEL_REQUIRED: "환불 경로 정보가 누락됐습니다. 주문을 다시 확인한 뒤 시도해 주세요.",
    INVALID_TRANSITION: "현재 주문 상태에서는 이 작업을 할 수 없습니다. 최신 주문 상태를 확인해 주세요.",
    STATE_CHANGED: "다른 요청으로 주문 상태가 변경됐습니다. 최신 주문 상태를 확인해 주세요.",
};

export class TransitionRequestError extends Error {
    constructor(readonly code: TransitionErrorCode) {
        super(errorMessages[code]);
        this.name = "TransitionRequestError";
    }
}

export function parseTransitionErrorCode(value: unknown): TransitionErrorCode | null {
    if (typeof value !== "object" || value === null || !("error" in value)) return null;
    const error = value.error;
    if (typeof error !== "object" || error === null || !("code" in error)) return null;
    const code = error.code;
    return typeof code === "string" && Object.hasOwn(errorMessages, code)
        ? code as TransitionErrorCode
        : null;
}
