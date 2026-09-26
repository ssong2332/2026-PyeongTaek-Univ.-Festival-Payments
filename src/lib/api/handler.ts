import { NextResponse } from "next/server";
import { toErrorResponse } from "./errors";
import { logger } from "@/lib/logger";

export function withHandler<Args extends unknown[] = unknown[]>(
    handler: (...args: Args) => Promise<Response> | Response,
    routeInfo?: { route: string },
) {
    return async function (...args: Args): Promise<Response> {
        try {
            return await handler(...args);
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
