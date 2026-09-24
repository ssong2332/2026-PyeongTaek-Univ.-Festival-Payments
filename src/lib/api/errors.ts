export type ErrorCode =
    | "VALIDATION_ERROR"
    | "REASON_REQUIRED"
    | "REFUND_CHANNEL_REQUIRED"
    | "UNAUTHORIZED"
    | "NOT_FOUND"
    | "MENU_UNAVAILABLE"
    | "OUT_OF_STOCK"
    | "INVALID_OPTION"
    | "INVALID_TRANSITION"
    | "STATE_CHANGED"
    | "CANCEL_REQUEST_NOT_ALLOWED"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";

export interface ErrorResponseEnvelope {
    error: {
        code: ErrorCode;
        message: string;
        details?: unknown;
    };
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    VALIDATION_ERROR: "Request validation failed.",
    REASON_REQUIRED: "Reason is required.",
    REFUND_CHANNEL_REQUIRED: "Refund channel is required.",
    UNAUTHORIZED: "Authentication is required.",
    NOT_FOUND: "Resource not found.",
    MENU_UNAVAILABLE: "Menu is unavailable.",
    OUT_OF_STOCK: "Out of stock.",
    INVALID_OPTION: "Invalid option selected.",
    INVALID_TRANSITION: "Invalid order status transition.",
    STATE_CHANGED: "Order state has changed.",
    CANCEL_REQUEST_NOT_ALLOWED: "Cancel request is not allowed.",
    RATE_LIMITED: "Rate limit exceeded.",
    INTERNAL_ERROR: "An internal server error occurred.",
};

// Architecture.md / PR #31 확정 시그니처: AppError(code, httpStatus, details?)
// message는 생성자 인자가 아니며 API 응답 변환 시 code에 대응하는 고정 영문 문구 사용
export class AppError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: ErrorCode, status: number = 400, details?: unknown) {
        super(code);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export function toErrorResponse(error: unknown): { status: number; envelope: ErrorResponseEnvelope } {
    if (error instanceof AppError) {
        const isInternal = error.status >= 500 || error.code === "INTERNAL_ERROR";
        const message = ERROR_MESSAGES[error.code] ?? "An error occurred.";

        return {
            status: error.status,
            envelope: {
                error: {
                    code: error.code,
                    message,
                    ...(!isInternal && error.details !== undefined ? { details: error.details } : {}),
                },
            },
        };
    }

    // Default internal server error (never leak internal stack/DB traces)
    return {
        status: 500,
        envelope: {
            error: {
                code: "INTERNAL_ERROR",
                message: ERROR_MESSAGES.INTERNAL_ERROR,
            },
        },
    };
}
