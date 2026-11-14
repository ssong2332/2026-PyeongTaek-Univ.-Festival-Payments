import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";

export const INVENTORY_PHOTO_BUCKET = "inventory-photos";
export const INVENTORY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const INVENTORY_PHOTO_RETENTION_DAYS = 30;
export const INVENTORY_PHOTO_UPLOAD_GRACE_HOURS = 24;
const PAGE_SIZE = 30;
const URL_TTL_SECONDS = 60 * 60;

type PhotoRow = {
    id: string;
    storage_path: string;
    captured_by: string;
    captured_at: string;
    content_type: string;
    byte_size: number;
};

const columns = "id, storage_path, captured_by, captured_at, content_type, byte_size";
const extension: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};
const allowedTypes = Object.keys(extension).sort();

type StorageFailure = { status?: number; statusCode?: string; message?: string };
function isMissingObject(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const failure = error as StorageFailure;
    return failure.statusCode === "NoSuchKey" ||
        ((failure.statusCode === "404" || failure.status === 404) && failure.message === "Object not found");
}

function assertPrivateBucket(bucket: { public: boolean; file_size_limit?: number; allowed_mime_types?: string[] }) {
    const types = bucket.allowed_mime_types?.slice().sort();
    if (bucket.public || bucket.file_size_limit !== INVENTORY_PHOTO_MAX_BYTES ||
        JSON.stringify(types) !== JSON.stringify(allowedTypes)) {
        logger.error("inventory.photos.bucket_policy_mismatch");
        throw new AppError("INTERNAL_ERROR", 500);
    }
}

function matchesContentType(bytes: Uint8Array, type: string) {
    if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (type === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    if (type === "image/webp") return bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    return false;
}

async function ensureBucket(client: SupabaseClient) {
    const { data } = await client.storage.getBucket(INVENTORY_PHOTO_BUCKET);
    if (data) { assertPrivateBucket(data); return; }
    const { error } = await client.storage.createBucket(INVENTORY_PHOTO_BUCKET, {
        public: false,
        fileSizeLimit: INVENTORY_PHOTO_MAX_BYTES,
        allowedMimeTypes: allowedTypes,
    });
    if (error) {
        // 다른 관리자 요청이 동시에 버킷을 만들었을 수 있다.
        const retry = await client.storage.getBucket(INVENTORY_PHOTO_BUCKET);
        if (!retry.data) throw new AppError("INTERNAL_ERROR", 500);
        assertPrivateBucket(retry.data);
        return;
    }
    const confirmed = await client.storage.getBucket(INVENTORY_PHOTO_BUCKET);
    if (!confirmed.data) throw new AppError("INTERNAL_ERROR", 500);
    assertPrivateBucket(confirmed.data);
}

export async function listInventoryPhotos(client: SupabaseClient, offset: number) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError("VALIDATION_ERROR", 400);
    const { data, error } = await client.from("inventory_photos").select(columns)
        .order("captured_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE);
    if (error) throw new AppError("INTERNAL_ERROR", 500);
    const rows = (data ?? []) as PhotoRow[];
    const page = rows.slice(0, PAGE_SIZE);
    const bucket = client.storage.from(INVENTORY_PHOTO_BUCKET);
    const resolved = await Promise.all(page.map(async (row) => {
        try {
            const { data: signed, error: signError } = await bucket.createSignedUrl(row.storage_path, URL_TTL_SECONDS);
            if (signed?.signedUrl && !signError) return { kind: "photo" as const, photo: {
                id: row.id, capturedBy: row.captured_by, capturedAt: row.captured_at,
                contentType: row.content_type, byteSize: row.byte_size, imageUrl: signed.signedUrl,
            } };
            if (isMissingObject(signError)) return { kind: "missing" as const };
            const info = await bucket.info(row.storage_path);
            return { kind: isMissingObject(info.error) ? "missing" as const : "error" as const };
        } catch {
            return { kind: "error" as const };
        }
    }));
    const photos = resolved.flatMap((result) => result.kind === "photo" ? [result.photo] : []);
    const unavailableCount = page.length - photos.length;
    if (unavailableCount) logger.warn("inventory.photos.unavailable", { count: unavailableCount });
    if (!photos.length && resolved.some((result) => result.kind === "error")) {
        throw new AppError("INTERNAL_ERROR", 500);
    }
    return { photos, hasMore: rows.length > PAGE_SIZE, nextOffset: offset + page.length, unavailableCount };
}

export async function saveInventoryPhoto(client: SupabaseClient, file: File, capturedBy: string, uploadedBy: string) {
    const name = capturedBy.trim();
    if (name.length < 1 || name.length > 80 || file.size < 1 || file.size > INVENTORY_PHOTO_MAX_BYTES ||
        !extension[file.type]) throw new AppError("VALIDATION_ERROR", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesContentType(bytes, file.type)) throw new AppError("VALIDATION_ERROR", 400);

    await ensureBucket(client);
    const id = crypto.randomUUID();
    const path = `${new Date().toISOString().slice(0, 10)}/${id}.${extension[file.type]}`;
    const intent = await client.from("inventory_photo_uploads").insert({ id, storage_path: path, uploaded_by: uploadedBy });
    if (intent.error) throw new AppError("INTERNAL_ERROR", 500);
    const bucket = client.storage.from(INVENTORY_PHOTO_BUCKET);
    const clearIntent = async () => {
        try {
            const result = await client.from("inventory_photo_uploads").delete().eq("id", id);
            if (result.error) logger.error("inventory.photos.intent_cleanup_failed", result.error, { keyPrefix: id.slice(0, 8) });
        } catch (error) {
            logger.error("inventory.photos.intent_cleanup_failed", error, { keyPrefix: id.slice(0, 8) });
        }
    };
    try {
        const { error: uploadError } = await bucket.upload(path, bytes, { contentType: file.type, upsert: false });
        if (uploadError) {
            logger.error("inventory.photos.upload_uncertain", uploadError, { keyPrefix: id.slice(0, 8) });
            throw new AppError("INTERNAL_ERROR", 500);
        }
    } catch (error) {
        // 응답이 끊겼다면 Storage에 파일이 생성됐을 수도 있다. 의도 기록을 남긴다.
        if (!(error instanceof AppError)) logger.error("inventory.photos.upload_uncertain", error, { keyPrefix: id.slice(0, 8) });
        throw new AppError("INTERNAL_ERROR", 500);
    }

    let saved: { data: PhotoRow | null; error: unknown };
    try {
        saved = await client.from("inventory_photos").insert({
            id, storage_path: path, captured_by: name, uploaded_by: uploadedBy,
            content_type: file.type, byte_size: file.size,
        }).select(columns).single() as { data: PhotoRow | null; error: unknown };
    } catch (error) {
        saved = { data: null, error };
    }
    if (saved.error || !saved.data) {
        // DB 응답 실패는 커밋 실패와 같지 않다. 참조를 확인할 수 없으면 파일을 보존한다.
        let phase = "reference_lookup";
        try {
            const reference = await client.from("inventory_photos").select("id").eq("storage_path", path).limit(1);
            if (reference.error) throw reference.error;
            if (!reference.data?.length) {
                phase = "storage_remove";
                const removed = await bucket.remove([path]);
                if (removed.error && !isMissingObject(removed.error)) throw removed.error;
                await clearIntent();
            } else {
                await clearIntent();
            }
        } catch (error) {
            logger.error("inventory.photos.compensation_failed", error, { keyPrefix: id.slice(0, 8), code: phase });
        }
        throw new AppError("INTERNAL_ERROR", 500);
    }
    await clearIntent();
    const row = saved.data;
    return {
        id: row.id, capturedBy: row.captured_by, capturedAt: row.captured_at,
        contentType: row.content_type, byteSize: row.byte_size,
    };
}

export async function reconcileInventoryPhotoUploads(client: SupabaseClient, now = new Date()) {
    const cutoff = new Date(now.getTime() - INVENTORY_PHOTO_UPLOAD_GRACE_HOURS * 60 * 60_000).toISOString();
    const { data, error } = await client.from("inventory_photo_uploads").select("id, storage_path")
        .lt("created_at", cutoff).order("created_at").limit(100);
    if (error) throw new AppError("INTERNAL_ERROR", 500);
    const intents = (data ?? []) as Pick<PhotoRow, "id" | "storage_path">[];
    const bucket = client.storage.from(INVENTORY_PHOTO_BUCKET);
    let orphanRemoved = 0;
    let failed = 0;
    for (const intent of intents) {
        try {
            const reference = await client.from("inventory_photos").select("id")
                .eq("storage_path", intent.storage_path).limit(1);
            if (reference.error) throw reference.error;
            if (!reference.data?.length) {
                const info = await bucket.info(intent.storage_path);
                if (info.error && !isMissingObject(info.error)) throw info.error;
                if (!info.error) {
                    const removed = await bucket.remove([intent.storage_path]);
                    if (removed.error && !isMissingObject(removed.error)) throw removed.error;
                    if (!removed.error) orphanRemoved += 1;
                }
            }
            const cleared = await client.from("inventory_photo_uploads").delete().eq("id", intent.id);
            if (cleared.error) throw cleared.error;
        } catch (error) {
            failed += 1;
            logger.error("inventory.photos.orphan_reconciliation_failed", error, { keyPrefix: intent.id.slice(0, 8) });
        }
    }
    if (orphanRemoved || failed) logger.info("inventory.photos.orphan_reconciliation", { count: orphanRemoved, failed });
    return { orphanRemoved, orphanFailed: failed };
}

export async function deleteExpiredInventoryPhotos(client: SupabaseClient, now = new Date()) {
    const cutoff = new Date(now.getTime() - INVENTORY_PHOTO_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
    const { data, error } = await client.from("inventory_photos").select("id, storage_path")
        .lt("captured_at", cutoff).order("captured_at").limit(100);
    if (error) throw new AppError("INTERNAL_ERROR", 500);
    const rows = (data ?? []) as Pick<PhotoRow, "id" | "storage_path">[];
    const bucket = client.storage.from(INVENTORY_PHOTO_BUCKET);
    let deleted = 0;
    let failed = 0;
    for (const row of rows) {
        try {
            const info = await bucket.info(row.storage_path);
            if (info.error && !isMissingObject(info.error)) { failed += 1; continue; }
            if (!info.error) {
                const removed = await bucket.remove([row.storage_path]);
                if (removed.error && !isMissingObject(removed.error)) { failed += 1; continue; }
            }
            const result = await client.from("inventory_photos").delete().eq("id", row.id).select("id");
            if (result.error) { failed += 1; continue; }
            deleted += result.data?.length ?? 0;
        } catch {
            failed += 1;
        }
    }
    if (failed) logger.warn("inventory.photos.cleanup_failed", { count: failed });
    return { deleted, failed };
}
