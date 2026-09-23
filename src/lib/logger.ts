export interface Logger {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, error?: unknown, context?: Record<string, unknown>): void;
}

function sanitizeValue(value: unknown): unknown {
    if (typeof value === "string") {
        // Mask phone numbers (010-XXXX-XXXX or 010XXXXXXXX)
        const maskedPhone = value.replace(/(01[016789]-?\d{3,4}-?\d{4})/g, "[redacted]");
        // Mask account-number like sequences (e.g. 10+ consecutive digits or dash separated digits)
        return maskedPhone.replace(/\b(\d{3,6}[-\s]?\d{2,6}[-\s]?\d{3,6})\b/g, "[redacted]");
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === "object") {
        const sanitizedObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            if (/account|phone|password|secret|token/i.test(k)) {
                sanitizedObj[k] = "[redacted]";
            } else {
                sanitizedObj[k] = sanitizeValue(v);
            }
        }
        return sanitizedObj;
    }
    return value;
}

export const logger: Logger = {
    debug(message: string, context?: Record<string, unknown>) {
        if (process.env.NODE_ENV !== "production") {
            console.debug(`[DEBUG] ${message}`, context ? sanitizeValue(context) : "");
        }
    },
    info(message: string, context?: Record<string, unknown>) {
        console.info(`[INFO] ${message}`, context ? sanitizeValue(context) : "");
    },
    warn(message: string, context?: Record<string, unknown>) {
        console.warn(`[WARN] ${message}`, context ? sanitizeValue(context) : "");
    },
    error(message: string, error?: unknown, context?: Record<string, unknown>) {
        console.error(`[ERROR] ${message}`, error, context ? sanitizeValue(context) : "");
    },
};
