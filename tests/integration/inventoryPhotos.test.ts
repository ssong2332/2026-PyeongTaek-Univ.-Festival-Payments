import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import {
  deleteExpiredInventoryPhotos, INVENTORY_PHOTO_BUCKET, listInventoryPhotos, reconcileInventoryPhotoUploads, saveInventoryPhoto,
} from "@/infra/supabase/inventoryPhotoStore";

const db = createServiceClient();
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
));
const created: { id: string; path: string }[] = [];

async function record(label: string) {
  const photo = await saveInventoryPhoto(db, new File([png], `${label}.png`, { type: "image/png" }), label, randomUUID());
  const { data, error } = await db.from("inventory_photos").select("storage_path, captured_by, byte_size")
    .eq("id", photo.id).single();
  if (error || !data) throw error ?? new Error("사진 메타데이터가 없습니다.");
  created.push({ id: photo.id, path: data.storage_path });
  expect(data).toMatchObject({ captured_by: label, byte_size: png.length });
  return { ...photo, path: data.storage_path };
}

afterAll(async () => {
  if (!created.length) return;
  const ids = created.map((item) => item.id);
  const paths = created.map((item) => item.path);
  const deleted = await db.from("inventory_photos").delete().in("id", ids);
  if (deleted.error) throw deleted.error;
  const removed = await db.storage.from(INVENTORY_PHOTO_BUCKET).remove(paths);
  if (removed.error) throw removed.error;
});

test("실제 Storage에서 저장·비공개 조회·30일 만료 삭제", async () => {
  const current = await record(`재고-${randomUUID()}`);
  const expired = await record(`지난재고-${randomUUID()}`);
  const bucket = db.storage.from(INVENTORY_PHOTO_BUCKET);

  const bucketInfo = await db.storage.getBucket(INVENTORY_PHOTO_BUCKET);
  expect(bucketInfo.error).toBeNull();
  expect(bucketInfo.data?.public).toBe(false);

  const listed = await listInventoryPhotos(db, 0);
  const currentPhoto = listed.photos.find((item) => item.id === current.id);
  expect(currentPhoto?.capturedBy).toBe(current.capturedBy);
  expect(currentPhoto?.imageUrl).toBeTruthy();
  const signedResponse = await fetch(currentPhoto!.imageUrl);
  expect(signedResponse.status).toBe(200);
  expect(new Uint8Array(await signedResponse.arrayBuffer())).toEqual(png);

  const anonRead = await anon.from("inventory_photos").select("id").eq("id", current.id);
  expect(anonRead.error?.code).toBe("42501");
  const anonSign = await anon.storage.from(INVENTORY_PHOTO_BUCKET).createSignedUrl(current.path, 60);
  expect(anonSign.error).not.toBeNull();

  const oldTime = new Date(Date.now() - 31 * 24 * 60 * 60_000).toISOString();
  const marked = await db.from("inventory_photos").update({ captured_at: oldTime }).eq("id", expired.id);
  expect(marked.error).toBeNull();
  expect(await deleteExpiredInventoryPhotos(db)).toEqual({ deleted: 1, failed: 0 });

  const afterCleanup = await db.from("inventory_photos").select("id").in("id", [current.id, expired.id]);
  expect(afterCleanup.error).toBeNull();
  expect(afterCleanup.data).toEqual([{ id: current.id }]);
  expect((await bucket.download(expired.path)).error).not.toBeNull();
  expect((await bucket.download(current.path)).error).toBeNull();

  // Storage 삭제 후 DB 삭제가 실패한 상태를 실제 서비스에 만든다.
  const stale = await record(`중단된정리-${randomUUID()}`);
  const staleTime = await db.from("inventory_photos").update({ captured_at: oldTime }).eq("id", stale.id);
  expect(staleTime.error).toBeNull();
  expect((await bucket.remove([stale.path])).error).toBeNull();
  const partial = await listInventoryPhotos(db, 0);
  expect(partial.photos.map((item) => item.id)).toContain(current.id);
  expect(partial.photos.map((item) => item.id)).not.toContain(stale.id);
  expect(partial.unavailableCount).toBe(1);
  expect(await deleteExpiredInventoryPhotos(db)).toEqual({ deleted: 1, failed: 0 });
  const recovered = await db.from("inventory_photos").select("id").eq("id", stale.id);
  expect(recovered.error).toBeNull();
  expect(recovered.data).toEqual([]);
}, 30_000);

test("실제 Storage의 미참조 파일을 재정리해도 정상 사진은 보존한다", async () => {
  const normal = await record(`보존-${randomUUID()}`);
  const id = randomUUID();
  const path = `${new Date().toISOString().slice(0, 10)}/${id}.png`;
  const bucket = db.storage.from(INVENTORY_PHOTO_BUCKET);
  const oldTime = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
  try {
    const intent = await db.from("inventory_photo_uploads").insert({
      id, storage_path: path, uploaded_by: randomUUID(),
      created_at: oldTime,
    });
    expect(intent.error).toBeNull();
    const staleNormalIntent = await db.from("inventory_photo_uploads").insert({
      id: normal.id, storage_path: normal.path, uploaded_by: randomUUID(), created_at: oldTime,
    });
    expect(staleNormalIntent.error).toBeNull();
    expect((await bucket.upload(path, png, { contentType: "image/png" })).error).toBeNull();
    expect(await reconcileInventoryPhotoUploads(db)).toEqual({ orphanRemoved: 1, orphanFailed: 0 });
    expect((await bucket.info(path)).error).not.toBeNull();
    expect((await bucket.info(normal.path)).error).toBeNull();
    const remaining = await db.from("inventory_photo_uploads").select("id").eq("id", id);
    expect(remaining.error).toBeNull();
    expect(remaining.data).toEqual([]);
    const anonIntent = await anon.from("inventory_photo_uploads").select("id").eq("id", normal.id);
    expect(anonIntent.error?.code).toBe("42501");
  } finally {
    await db.from("inventory_photo_uploads").delete().in("id", [id, normal.id]);
    await bucket.remove([path]);
  }
}, 30_000);
