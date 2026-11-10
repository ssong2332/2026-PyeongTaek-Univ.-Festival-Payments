import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteExpiredInventoryPhotos, listInventoryPhotos, saveInventoryPhoto,
} from "@/infra/supabase/inventoryPhotoStore";

const row = {
  id: "11111111-1111-4111-8111-111111111111", storage_path: "2026-11-10/photo.jpg",
  captured_by: "김혁", captured_at: "2026-11-10T00:00:00Z", content_type: "image/jpeg", byte_size: 3,
};
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "stock.jpg", { type: "image/jpeg" });

describe("재고 사진 저장소", () => {
  it("실제 파일 형식이 MIME과 다르면 버킷에 접근하지 않는다", async () => {
    const client = { storage: { getBucket: vi.fn() } } as unknown as SupabaseClient;
    const fake = new File(["invalid"], "stock.jpg", { type: "image/jpeg" });
    await expect(saveInventoryPhoto(client, fake, "김혁", "admin-id")).rejects.toMatchObject({ status: 400 });
    expect(client.storage.getBucket).not.toHaveBeenCalled();
  });

  it("DB 저장 실패 시 업로드한 파일을 제거한다", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "db failed" } });
    const client = {
      storage: { getBucket: vi.fn().mockResolvedValue({ data: { id: "inventory-photos" } }), from: vi.fn().mockReturnValue({ upload, remove }) },
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) }),
    } as unknown as SupabaseClient;
    await expect(saveInventoryPhoto(client, jpeg(), " 김혁 ", "admin-id")).rejects.toMatchObject({ status: 500 });
    expect(upload).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^\d{4}-\d{2}-\d{2}\/.+\.jpg$/)]);
  });

  it("목록은 비공개 파일의 서명 URL을 돌려준다", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.com/signed" }, error: null });
    const range = vi.fn().mockResolvedValue({ data: [row], error: null });
    const query = { order: vi.fn().mockReturnThis(), range };
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as unknown as SupabaseClient;
    const result = await listInventoryPhotos(client, 0);
    expect(result.photos[0]).toMatchObject({ id: row.id, imageUrl: "https://example.com/signed" });
    expect(createSignedUrl).toHaveBeenCalledWith(row.storage_path, 3600);
  });

  it("30일 지난 사진만 Storage API와 DB 양쪽에서 삭제한다", async () => {
    const lt = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const inIds = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ lt, order: vi.fn().mockReturnValue({ limit }) }), delete: vi.fn().mockReturnValue({ in: inIds }) }),
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    } as unknown as SupabaseClient;
    expect(await deleteExpiredInventoryPhotos(client, new Date("2026-11-10T00:00:00Z"))).toEqual({ deleted: 1 });
    expect(lt).toHaveBeenCalledWith("captured_at", "2026-10-11T00:00:00.000Z");
    expect(remove).toHaveBeenCalledWith([row.storage_path]);
    expect(inIds).toHaveBeenCalledWith("id", [row.id]);
  });
});
