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

export class AppError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: ErrorCode, message: string, status: number = 400, details?: unknown) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

export function toErrorResponse(error: unknown): { status: number; envelope: ErrorResponseEnvelope } {
    if (error instanceof AppError) {
        return {
            status: error.status,
            envelope: {
                error: {
                    code: error.code,
                    message: error.message,
                    ...(error.details !== undefined ? { details: error.details } : {}),
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
                message: "An internal server error occurred.",
            },
        },
    };
}
