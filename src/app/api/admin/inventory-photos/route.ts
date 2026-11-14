import { NextResponse } from "next/server";
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { AppError } from "@/lib/api/errors";
import { withHandler } from "@/lib/api/handler";
import { logger } from "@/lib/logger";
import {
    deleteExpiredInventoryPhotos, listInventoryPhotos, reconcileInventoryPhotoUploads, saveInventoryPhoto,
} from "@/infra/supabase/inventoryPhotoStore";

export const dynamic = "force-dynamic";
const route = { route: "/api/admin/inventory-photos" };
const noStore = { "Cache-Control": "private, no-store" };

export const GET = withHandler(async (request: Request) => {
    await requireAdmin();
    const raw = new URL(request.url).searchParams.get("offset") ?? "0";
    if (!/^(0|[1-9]\d*)$/.test(raw)) throw new AppError("VALIDATION_ERROR", 400);
    const result = await listInventoryPhotos(createServiceClient(), Number(raw));
    return NextResponse.json(result, { headers: noStore });
}, route);

export const POST = withHandler(async (request: Request) => {
    const admin = await requireAdmin();
    const form = await request.formData().catch(() => { throw new AppError("VALIDATION_ERROR", 400); });
    const file = form.get("photo");
    const name = form.get("capturedBy");
    if (!(file instanceof File) || typeof name !== "string") throw new AppError("VALIDATION_ERROR", 400);
    const photo = await saveInventoryPhoto(createServiceClient(), file, name, admin.id);
    return NextResponse.json(photo, { status: 201, headers: noStore });
}, route);

export const DELETE = withHandler(async () => {
    const admin = await requireAdmin();
    const client = createServiceClient();
    const expired = await deleteExpiredInventoryPhotos(client);
    const orphans = await reconcileInventoryPhotoUploads(client);
    logger.info("inventory.photos.manual_cleanup", {
        actorId: admin.id, count: expired.deleted, failed: expired.failed + orphans.orphanFailed,
        orphanRemoved: orphans.orphanRemoved,
    });
    return NextResponse.json({ ...expired, ...orphans }, { headers: noStore });
}, route);
