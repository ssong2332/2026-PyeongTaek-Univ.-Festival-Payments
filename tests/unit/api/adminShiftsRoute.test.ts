import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/infra/supabase/session", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/infra/supabase/server", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/infra/repositories/supabaseShiftRepository", () => ({ createSupabaseShiftRepository: vi.fn() }));
import { requireAdmin } from "@/infra/supabase/session";
import { createServiceClient } from "@/infra/supabase/server";
import { createSupabaseShiftRepository } from "@/infra/repositories/supabaseShiftRepository";
import { GET, POST } from "@/app/api/admin/shifts/route";
import { PATCH, DELETE } from "@/app/api/admin/shifts/[id]/route";
import { AppError } from "@/lib/api/errors";
import type { ShiftRepository } from "@/services/ports";

const id = "11111111-1111-4111-8111-111111111111";
const input = { personName: "홍길동", date: "2026-10-07", startsAt: "10:00", endsAt: "12:00", role: "주문 확인" };
const shift = { id, ...input };
const repo: ShiftRepository = { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() };
const context = { params: Promise.resolve({ id }) };
function request(method: string, body: unknown = input) {
  return new Request("http://localhost/api/admin/shifts", { method, ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin" } as Awaited<ReturnType<typeof requireAdmin>>);
  vi.mocked(createSupabaseShiftRepository).mockReturnValue(repo);
  vi.mocked(repo.list).mockResolvedValue([shift]);
  vi.mocked(repo.create).mockResolvedValue(shift);
  vi.mocked(repo.update).mockResolvedValue(shift);
  vi.mocked(repo.remove).mockResolvedValue(undefined);
});

describe("관리자 교대 스케줄 API", () => {
  it("목록·생성·수정·삭제는 200·201·200·204를 반환한다", async () => {
    expect(await (await GET()).json()).toEqual({ shifts: [shift] });
    expect((await POST(request("POST"))).status).toBe(201);
    expect((await PATCH(request("PATCH"), context)).status).toBe(200);
    expect((await DELETE(request("DELETE"), context)).status).toBe(204);
    expect(repo.create).toHaveBeenCalledWith(input);
    expect(repo.update).toHaveBeenCalledWith(id, input);
    expect(repo.remove).toHaveBeenCalledWith(id);
  });
  it.each(["GET", "POST", "PATCH", "DELETE"])("%s 비로그인은 DB 접근 전에 401", async (method) => {
    vi.mocked(requireAdmin).mockRejectedValue(new AppError("UNAUTHORIZED", 401));
    const response = method === "GET" ? await GET() : method === "POST" ? await POST(request(method))
      : method === "PATCH" ? await PATCH(request(method), context) : await DELETE(request(method), context);
    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(createSupabaseShiftRepository).not.toHaveBeenCalled();
  });
  it.each([{ endsAt: "09:00" }, { personName: "" }, { date: "2026-02-30" }, { extra: true }])("잘못된 본문 %j는 저장하지 않고 400", async (change) => {
    expect((await POST(request("POST", { ...input, ...change }))).status).toBe(400);
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("잘못된 UUID는 400이고 수정·삭제 저장소를 호출하지 않는다", async () => {
    const badContext = { params: Promise.resolve({ id: "not-a-uuid" }) };
    expect((await PATCH(request("PATCH"), badContext)).status).toBe(400);
    expect((await DELETE(request("DELETE"), badContext)).status).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });
  it("미존재 행은 404, DB 오류는 내부 정보를 숨긴 500", async () => {
    vi.mocked(repo.update).mockRejectedValueOnce(new AppError("NOT_FOUND", 404));
    expect((await PATCH(request("PATCH"), context)).status).toBe(404);
    vi.mocked(repo.list).mockRejectedValueOnce(new Error("secret database trace"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("JSON이 아닌 요청은 400", async () => {
    expect((await POST(new Request("http://localhost/api/admin/shifts", { method: "POST", body: "{" }))).status).toBe(400);
  });
});
