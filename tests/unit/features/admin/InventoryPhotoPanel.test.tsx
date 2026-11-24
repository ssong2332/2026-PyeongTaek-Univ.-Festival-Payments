// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { InventoryPhotoPanel } from "@/features/admin/InventoryPhotoPanel";

const photo = (id: string, capturedBy: string) => ({
  id, capturedBy, capturedAt: "2026-11-10T00:00:00Z", contentType: "image/png",
  byteSize: 68, imageUrl: `https://example.com/${id}.png`,
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("서명 실패 사진을 안내하고 다음 페이지는 DB 오프셋으로 요청한다", async () => {
  const first = { photos: [photo("11111111-1111-4111-8111-111111111111", "첫 촬영")], hasMore: true, nextOffset: 30, unavailableCount: 1 };
  const second = { photos: [photo("22222222-2222-4222-8222-222222222222", "다음 촬영")], hasMore: false, nextOffset: 31, unavailableCount: 0 };
  const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
    ok: true, status: 200, json: async () => url.endsWith("offset=30") ? second : first,
  }));
  vi.stubGlobal("fetch", fetchMock);

  render(<InventoryPhotoPanel activeShifts={[]} />);
  await screen.findByText("첫 촬영");
  expect(screen.getByText(/사진 1건을 표시하지 못했습니다/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "이전 사진 더 보기" }));
  await screen.findByText("다음 촬영");
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/inventory-photos?offset=30", { cache: "no-store" });
  expect(screen.getByText("첫 촬영")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("button", { name: "이전 사진 더 보기" })).toBeNull());
});
