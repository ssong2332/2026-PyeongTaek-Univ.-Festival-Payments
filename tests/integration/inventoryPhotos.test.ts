import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, expect, test } from "vitest";
import { createServiceClient } from "@/infra/supabase/server";
import {
  deleteExpiredInventoryPhotos, INVENTORY_PHOTO_BUCKET, listInventoryPhotos, saveInventoryPhoto,
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
  expect(await deleteExpiredInventoryPhotos(db)).toEqual({ deleted: 1 });

  const afterCleanup = await db.from("inventory_photos").select("id").in("id", [current.id, expired.id]);
  expect(afterCleanup.error).toBeNull();
  expect(afterCleanup.data).toEqual([{ id: current.id }]);
  expect((await bucket.download(expired.path)).error).not.toBeNull();
  expect((await bucket.download(current.path)).error).toBeNull();
}, 30_000);
