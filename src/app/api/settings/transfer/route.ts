import { NextResponse } from "next/server";
import { withHandler } from "@/lib/api/handler";
import { getTransferSettings } from "@/services/settingsService";
import { SupabaseSettingsRepository } from "@/infra/repositories/settingsRepository";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withHandler(async () => {
    const repository = new SupabaseSettingsRepository();
    const settings = await getTransferSettings(repository, logger);
    return NextResponse.json(settings, { status: 200 });
});
