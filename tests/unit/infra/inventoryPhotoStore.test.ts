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

  it("서명 실패 행만 건너뛰고 DB 행 기준으로 다음 페이지를 읽는다", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      ...row, id: `photo-${index}`, storage_path: index === 0 ? "missing.jpg" : `photo-${index}.jpg`,
    }));
    const range = vi.fn().mockImplementation(async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }));
    const createSignedUrl = vi.fn().mockImplementation(async (path: string) =>
      path === "missing.jpg" ? { data: null, error: new Error("not found") }
        : { data: { signedUrl: `https://example.com/${path}` }, error: null });
    const client = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnThis(), range }) }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
    } as unknown as SupabaseClient;
    const first = await listInventoryPhotos(client, 0);
    expect(first).toMatchObject({ hasMore: true, nextOffset: 30, unavailableCount: 1 });
    expect(first.photos).toHaveLength(29);
    expect(first.photos[0].id).toBe("photo-1");
    const second = await listInventoryPhotos(client, first.nextOffset);
    expect(second).toMatchObject({ hasMore: false, nextOffset: 31, unavailableCount: 0 });
    expect(second.photos.map((photo) => photo.id)).toEqual(["photo-30"]);
    expect(range).toHaveBeenLastCalledWith(30, 60);
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

  it("파일 삭제 후 DB 삭제 실패로 남은 행을 다음 정리에서 지운다", async () => {
    let remains = true;
    let fileExists = true;
    let failDelete = true;
    const limit = vi.fn().mockImplementation(async () => ({ data: remains ? [row] : [], error: null }));
    const remove = vi.fn().mockImplementation(async () => {
      fileExists = false;
      return { error: null };
    });
    const inIds = vi.fn().mockImplementation(async () => {
      if (failDelete) { failDelete = false; return { error: new Error("db unavailable") }; }
      remains = false;
      return { error: null };
    });
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ lt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnValue({ limit }) }),
        delete: vi.fn().mockReturnValue({ in: inIds }),
      }),
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    } as unknown as SupabaseClient;
    const now = new Date("2026-11-10T00:00:00Z");
    await expect(deleteExpiredInventoryPhotos(client, now)).rejects.toMatchObject({ status: 500 });
    expect({ remains, fileExists }).toEqual({ remains: true, fileExists: false });
    expect(await deleteExpiredInventoryPhotos(client, now)).toEqual({ deleted: 1 });
    expect({ remains, fileExists }).toEqual({ remains: false, fileExists: false });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
