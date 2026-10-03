// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import { ShiftManagement, type ShiftApi } from "@/features/admin/ShiftManagement";
import { AppError } from "@/lib/api/errors";
import type { Shift } from "@/domain/shift/schedule";

const now = "2026-10-07T02:00:00Z";
const row: Shift = { id: "11111111-1111-4111-8111-111111111111", personName: "홍길동", date: "2026-10-07", startsAt: "10:00", endsAt: "12:00", role: "주문 확인" };
function api(rows: Shift[] = []): ShiftApi {
  return { list: vi.fn().mockResolvedValue(rows), create: vi.fn().mockImplementation(async (input) => ({ ...input, id: row.id })),
    update: vi.fn().mockImplementation(async (id, input) => ({ ...input, id })), remove: vi.fn().mockResolvedValue(undefined) };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
async function loaded(client: ShiftApi) {
  render(<ShiftManagement initialNow={now} api={client} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "스케줄 등록" }) as HTMLButtonElement).disabled).toBe(false));
}
describe("교대 스케줄 화면", () => {
  it("빈 목록과 현재 담당자 없음 표시", async () => {
    await loaded(api());
    expect(screen.getByText("등록된 스케줄 없음")).toBeTruthy();
    expect(screen.getByText("현재 담당자 없음")).toBeTruthy();
  });
  it("현재 담당자에 겹치는 두 명을 함께 표시", async () => {
    await loaded(api([row, { ...row, id: "22222222-2222-4222-8222-222222222222", personName: "김철수", role: "조리" }]));
    const current = screen.getByRole("region", { name: "현재 담당자" });
    expect(within(current).getByText("홍길동")).toBeTruthy();
    expect(within(current).getByText("김철수")).toBeTruthy();
  });
  it("추가·수정·삭제를 저장소에 보내고 결과를 표에 반영", async () => {
    const client = api();
    await loaded(client);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
    fireEvent.change(screen.getByLabelText("역할"), { target: { value: "주문 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "스케줄 등록" }));
    await screen.findByRole("button", { name: "홍길동 2026-10-07 10:00 수정" });
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ personName: "홍길동" }));
    fireEvent.click(screen.getByRole("button", { name: "홍길동 2026-10-07 10:00 수정" }));
    fireEvent.change(screen.getByLabelText("역할"), { target: { value: "조리" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(client.update).toHaveBeenCalledWith(row.id, expect.objectContaining({ role: "조리" })));
    await screen.findByRole("button", { name: "스케줄 등록" });
    fireEvent.click(screen.getByRole("button", { name: "홍길동 2026-10-07 10:00 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제 확인" }));
    await screen.findByText("등록된 스케줄 없음");
    expect(client.remove).toHaveBeenCalledWith(row.id);
  });
  it("종료<시작을 즉시 표시하고 저장하지 않는다", async () => {
    const client = api();
    await loaded(client);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
    fireEvent.change(screen.getByLabelText("역할"), { target: { value: "조리" } });
    fireEvent.change(screen.getByLabelText("종료 시각"), { target: { value: "09:00" } });
    expect(screen.getByText("종료 시각은 시작 시각보다 늦어야 합니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "스케줄 등록" }));
    expect(client.create).not.toHaveBeenCalled();
  });
  it("저장 중 폼을 잠그고 실패 시 입력과 오류 안내를 유지", async () => {
    const client = api();
    let rejectSave: (error: Error) => void = () => {};
    vi.mocked(client.create).mockImplementation(() => new Promise((_, reject) => { rejectSave = reject; }));
    await loaded(client);
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
    fireEvent.change(screen.getByLabelText("역할"), { target: { value: "조리" } });
    fireEvent.click(screen.getByRole("button", { name: "스케줄 등록" }));
    expect((screen.getByLabelText("이름") as HTMLInputElement).disabled).toBe(true);
    await act(async () => rejectSave(new Error("offline")));
    expect(screen.getByRole("alert").textContent).toContain("저장에 실패");
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("홍길동");
  });
  it("목록 조회 실패는 빈 목록으로 표시하지 않고 재시도로 복구", async () => {
    const client = api();
    vi.mocked(client.list).mockRejectedValueOnce(new Error("offline"));
    render(<ShiftManagement initialNow={now} api={client} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("등록된 스케줄 없음")).toBeNull();
    expect((screen.getByRole("button", { name: "스케줄 등록" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await screen.findByText("등록된 스케줄 없음");
  });
  it("세션 만료는 로그인 화면으로 이동", async () => {
    const client = api();
    vi.mocked(client.list).mockRejectedValueOnce(new AppError("UNAUTHORIZED", 401));
    render(<ShiftManagement initialNow={now} api={client} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
