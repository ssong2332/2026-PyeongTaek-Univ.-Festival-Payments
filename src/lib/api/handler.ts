import { NextResponse } from "next/server";
import { toErrorResponse } from "./errors";
import { logger } from "@/lib/logger";

export function withHandler<T>(handler: () => Promise<NextResponse<T>> | NextResponse<T>) {
    return async function (): Promise<NextResponse> {
        try {
            return await handler();
        } catch (error) {
            const { status, envelope } = toErrorResponse(error);
            logger.error(`API Error [${envelope.error.code}]: ${envelope.error.message}`, error);
            return NextResponse.json(envelope, { status });
        }
    };
}
