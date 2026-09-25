export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
    event?: string;
    requestId?: string;
    route?: string;
    orderId?: string;
    pickupNumber?: number;
    code?: string;
    durationMs?: number;
    message?: string;
    [key: string]: unknown;
}

export interface Logger {
    debug(event: string, context?: LogContext): void;
    info(event: string, context?: LogContext): void;
    warn(event: string, context?: LogContext): void;
    error(event: string, error?: unknown, context?: LogContext): void;
}

const ALLOWED_FIELDS = new Set([
    "level",
    "event",
    "requestId",
    "route",
    "orderId",
    "pickupNumber",
    "code",
    "durationMs",
    "message",
    "time",
]);

function formatLogLine(level: LogLevel, event: string, context?: LogContext): string {
    const raw: Record<string, unknown> = {
        level,
        event,
        time: new Date().toISOString(),
        ...(context ?? {}),
    };

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(raw)) {
        const isPhoneField = /phone/i.test(key);

        if (!ALLOWED_FIELDS.has(key) && !isPhoneField) {
            continue;
        }

        if (isPhoneField) {
            sanitized[key] = "[redacted]";
        } else if (typeof value === "string") {
            if (key === "orderId" && value.length > 8) {
                sanitized[key] = value.slice(0, 8);
            } else {
                sanitized[key] = value;
            }
        } else {
            sanitized[key] = value;
        }
    }

    return JSON.stringify(sanitized);
}

export const logger: Logger = {
    debug(event: string, context?: LogContext) {
        if (process.env.NODE_ENV !== "production") {
            console.debug(formatLogLine("debug", event, context));
        }
    },
    info(event: string, context?: LogContext) {
        console.info(formatLogLine("info", event, context));
    },
    warn(event: string, context?: LogContext) {
        console.warn(formatLogLine("warn", event, context));
    },
    error(event: string, error?: unknown, context?: LogContext) {
        let code = context?.code;
        let message = context?.message;

        if (error instanceof Error) {
            message = message ?? error.name;
            if ("code" in error && typeof (error as { code: unknown }).code === "string") {
                code = (error as { code: string }).code;
            }
        } else if (typeof error === "string") {
            message = message ?? error;
        }

        const logContext: LogContext = {
            ...(context ?? {}),
            ...(code ? { code } : {}),
            ...(message ? { message } : {}),
        };

        console.error(formatLogLine("error", event, logContext));
    },
};
