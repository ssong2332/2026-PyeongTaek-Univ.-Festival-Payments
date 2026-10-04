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
    | "REVIEW_NOT_ALLOWED"
    | "REVIEW_ALREADY_SUBMITTED"
    | "RATE_LIMITED"
    | "CALL_COOLDOWN"
    | "INTERNAL_ERROR";

export interface ErrorResponseEnvelope { error: { code: ErrorCode; message: string; details?: unknown } }

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
    VALIDATION_ERROR: "Request validation failed.", REASON_REQUIRED: "Reason is required.",
    REFUND_CHANNEL_REQUIRED: "Refund channel is required.", UNAUTHORIZED: "Authentication is required.",
    NOT_FOUND: "Resource not found.", MENU_UNAVAILABLE: "Menu is unavailable.", OUT_OF_STOCK: "Out of stock.",
    INVALID_OPTION: "Invalid option selected.", INVALID_TRANSITION: "Invalid order status transition.",
    STATE_CHANGED: "Order state has changed.", CANCEL_REQUEST_NOT_ALLOWED: "Cancel request is not allowed.",
    REVIEW_NOT_ALLOWED: "Reviews are only allowed for completed orders.", REVIEW_ALREADY_SUBMITTED: "A review has already been submitted for this order.",
    RATE_LIMITED: "Rate limit exceeded.", CALL_COOLDOWN: "Please wait before calling staff again.",
    INTERNAL_ERROR: "An internal server error occurred.",
};

export class AppError extends Error {
    readonly code: ErrorCode; readonly status: number; readonly details?: unknown;
    constructor(code: ErrorCode, status: number = 400, details?: unknown) { super(code); this.name = "AppError"; this.code = code; this.status = status; this.details = details; }
}

export function toErrorResponse(error: unknown): { status: number; envelope: ErrorResponseEnvelope; headers?: Record<string, string> } {
    if (error instanceof AppError) {
        const isInternal = error.status >= 500 || error.code === "INTERNAL_ERROR";
        const headers: Record<string, string> = {};
        if ((error.code === "RATE_LIMITED" || error.code === "CALL_COOLDOWN") && error.details && typeof error.details === "object" && "retryAfterSeconds" in error.details && typeof (error.details as { retryAfterSeconds: unknown }).retryAfterSeconds === "number") {
            headers["Retry-After"] = String((error.details as { retryAfterSeconds: number }).retryAfterSeconds);
        }
        return { status: error.status, envelope: { error: { code: error.code, message: ERROR_MESSAGES[error.code] ?? "An error occurred.", ...(!isInternal && error.details !== undefined ? { details: error.details } : {}) } }, ...(Object.keys(headers).length ? { headers } : {}) };
    }
    return { status: 500, envelope: { error: { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR } } };
}
