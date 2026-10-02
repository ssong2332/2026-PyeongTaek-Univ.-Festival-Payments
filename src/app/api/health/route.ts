import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/infra/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
    const time = new Date().toISOString();

    try {
        const client = createServiceClient();
        const { error } = await client
            .from("app_settings")
            .select("key")
            .limit(1);

        if (error) {
            logger.warn("health.db_unhealthy", { time, error: error.message });
            return NextResponse.json(
                { ok: false, db: false, time },
                { status: 503 },
            );
        }

        return NextResponse.json(
            { ok: true, db: true, time },
            { status: 200 },
        );
    } catch (error) {
        logger.error("health.check_failed", error, { time });
        return NextResponse.json(
            { ok: false, db: false, time },
            { status: 503 },
        );
    }
}
