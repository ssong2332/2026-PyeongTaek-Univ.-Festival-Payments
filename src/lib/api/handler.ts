import { NextResponse } from "next/server";
import { toErrorResponse } from "./errors";
import { logger } from "@/lib/logger";

export function withHandler<T>(
    handler: () => Promise<NextResponse<T>> | NextResponse<T>,
    routeInfo?: { route: string },
) {
    return async function (): Promise<NextResponse> {
        try {
            return await handler();
        } catch (error) {
            const { status, envelope } = toErrorResponse(error);
            logger.error("api.error", error, {
                route: routeInfo?.route,
                code: envelope.error.code,
            });
            return NextResponse.json(envelope, { status });
        }
    };
}
