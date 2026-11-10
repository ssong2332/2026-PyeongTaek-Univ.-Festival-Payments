import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/api/errors";

export const INVENTORY_PHOTO_BUCKET = "inventory-photos";
export const INVENTORY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const INVENTORY_PHOTO_RETENTION_DAYS = 30;
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
    if (data) return;
    const { error } = await client.storage.createBucket(INVENTORY_PHOTO_BUCKET, {
        public: false,
        fileSizeLimit: INVENTORY_PHOTO_MAX_BYTES,
        allowedMimeTypes: Object.keys(extension),
    });
    if (error) {
        // 다른 관리자 요청이 동시에 버킷을 만들었을 수 있다.
        const retry = await client.storage.getBucket(INVENTORY_PHOTO_BUCKET);
        if (!retry.data) throw new AppError("INTERNAL_ERROR", 500);
    }
}

export async function listInventoryPhotos(client: SupabaseClient, offset: number) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError("VALIDATION_ERROR", 400);
    const { data, error } = await client.from("inventory_photos").select(columns)
        .order("captured_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE);
    if (error) throw new AppError("INTERNAL_ERROR", 500);
    const rows = (data ?? []) as PhotoRow[];
    const photos = await Promise.all(rows.slice(0, PAGE_SIZE).map(async (row) => {
        const { data: signed, error: signError } = await client.storage.from(INVENTORY_PHOTO_BUCKET)
            .createSignedUrl(row.storage_path, URL_TTL_SECONDS);
        if (signError || !signed) throw new AppError("INTERNAL_ERROR", 500);
        return {
            id: row.id, capturedBy: row.captured_by, capturedAt: row.captured_at,
            contentType: row.content_type, byteSize: row.byte_size, imageUrl: signed.signedUrl,
        };
    }));
    return { photos, hasMore: rows.length > PAGE_SIZE };
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
    const bucket = client.storage.from(INVENTORY_PHOTO_BUCKET);
    const { error: uploadError } = await bucket.upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new AppError("INTERNAL_ERROR", 500);

    const { data, error } = await client.from("inventory_photos").insert({
        id, storage_path: path, captured_by: name, uploaded_by: uploadedBy,
        content_type: file.type, byte_size: file.size,
    }).select(columns).single();
    if (error || !data) {
        await bucket.remove([path]);
        throw new AppError("INTERNAL_ERROR", 500);
    }
    const row = data as PhotoRow;
    return {
        id: row.id, capturedBy: row.captured_by, capturedAt: row.captured_at,
        contentType: row.content_type, byteSize: row.byte_size,
    };
}

export async function deleteExpiredInventoryPhotos(client: SupabaseClient, now = new Date()) {
    const cutoff = new Date(now.getTime() - INVENTORY_PHOTO_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();
    const { data, error } = await client.from("inventory_photos").select("id, storage_path")
        .lt("captured_at", cutoff).order("captured_at").limit(100);
    if (error) throw new AppError("INTERNAL_ERROR", 500);
    const rows = (data ?? []) as Pick<PhotoRow, "id" | "storage_path">[];
    if (!rows.length) return { deleted: 0 };
    const { error: removeError } = await client.storage.from(INVENTORY_PHOTO_BUCKET)
        .remove(rows.map((row) => row.storage_path));
    if (removeError) throw new AppError("INTERNAL_ERROR", 500);
    const { error: deleteError } = await client.from("inventory_photos").delete()
        .in("id", rows.map((row) => row.id));
    if (deleteError) throw new AppError("INTERNAL_ERROR", 500);
    return { deleted: rows.length };
}
