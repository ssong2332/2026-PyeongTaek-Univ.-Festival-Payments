import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/infra/supabase/inventoryPhotoStore", () => ({
  listInventoryPhotos: vi.fn(), saveInventoryPhoto: vi.fn(), deleteExpiredInventoryPhotos: vi.fn(), reconcileInventoryPhotoUploads: vi.fn(),
}));

import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { listInventoryPhotos, saveInventoryPhoto, deleteExpiredInventoryPhotos, reconcileInventoryPhotoUploads } from "@/infra/supabase/inventoryPhotoStore";
import { GET, POST, DELETE } from "@/app/api/admin/inventory-photos/route";
import { AppError } from "@/lib/api/errors";

const url = "http://localhost/api/admin/inventory-photos";
const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "stock.jpg", { type: "image/jpeg" });
function post(file: File | null = photo, name = "김혁") {
  const form = new FormData();
  if (file) form.append("photo", file);
  form.append("capturedBy", name);
  return new Request(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-id" } as Awaited<ReturnType<typeof requireAdmin>>);
  vi.mocked(createServiceClient).mockReturnValue({} as ReturnType<typeof createServiceClient>);
  vi.mocked(listInventoryPhotos).mockResolvedValue({ photos: [], hasMore: false, nextOffset: 0, unavailableCount: 0 });
  vi.mocked(deleteExpiredInventoryPhotos).mockResolvedValue({ deleted: 0, failed: 0 });
  vi.mocked(reconcileInventoryPhotoUploads).mockResolvedValue({ orphanRemoved: 0, orphanFailed: 0 });
  vi.mocked(saveInventoryPhoto).mockResolvedValue({ id: "photo-id", capturedBy: "김혁", capturedAt: "2026-11-10T00:00:00Z", contentType: "image/jpeg", byteSize: 3 });
});

describe("관리자 재고 사진 API", () => {
  it.each(["GET", "POST", "DELETE"])("%s 인증 실패 시 저장소에 접근하지 않는다", async (method) => {
    vi.mocked(requireAdmin).mockRejectedValue(new AppError("UNAUTHORIZED", 401));
    const response = method === "GET" ? await GET(new Request(url)) : method === "POST" ? await POST(post()) : await DELETE();
    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("목록은 페이지 오프셋을 검증하고 캐시를 막는다", async () => {
    expect((await GET(new Request(`${url}?offset=-1`))).status).toBe(400);
    expect(listInventoryPhotos).not.toHaveBeenCalled();
    const response = await GET(new Request(`${url}?offset=30`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(listInventoryPhotos).toHaveBeenCalledWith(expect.anything(), 30);
  });

  it("multipart 사진과 촬영자를 저장하고 지난 사진을 정리한다", async () => {
    const response = await POST(post());
    expect(response.status).toBe(201);
    expect(saveInventoryPhoto).toHaveBeenCalledWith(expect.anything(), expect.any(File), "김혁", "admin-id");
    expect((await DELETE()).status).toBe(200);
    expect(deleteExpiredInventoryPhotos).toHaveBeenCalledOnce();
    expect(reconcileInventoryPhotoUploads).toHaveBeenCalledOnce();
  });

  it("사진이 없는 업로드는 400", async () => {
    expect((await POST(post(null))).status).toBe(400);
    expect(saveInventoryPhoto).not.toHaveBeenCalled();
  });
});
