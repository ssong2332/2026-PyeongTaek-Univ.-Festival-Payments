// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffCallAlert } from "@/components/admin/StaffCallAlert";
import type { StaffCallDto } from "@/lib/dto/staffCall";

const call: StaffCallDto = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  pickupNumber: 7,
  calledAt: "2026-10-04T12:00:00.000Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

afterEach(cleanup);

describe("T-27 StaffCallAlert", () => {
  it("미확인 호출이 없으면 빈 상태를 표시한다", () => {
    render(<StaffCallAlert calls={[]} onAcknowledge={vi.fn()} />);
    expect(screen.getByText("직원 호출 알림 없음")).toBeTruthy();
  });

  it("첫 조회 중에는 호출 없음으로 단정하지 않는다", () => {
    render(<StaffCallAlert calls={[]} onAcknowledge={vi.fn()} isLoading />);
    expect(screen.getByText("직원 호출 확인 중…")).toBeTruthy();
    expect(screen.queryByText("직원 호출 알림 없음")).toBeNull();
  });

  it("조회 실패를 빈 목록과 구분하고 다시 조회할 수 있다", () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    render(<StaffCallAlert calls={[]} onAcknowledge={vi.fn()} error="Failed to fetch staff calls" onReload={onReload} />);
    expect(screen.getByRole("alert").textContent).toContain("불러오지 못했습니다");
    expect(screen.queryByText("직원 호출 알림 없음")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("호출을 확인하면 처리 중을 표시하고 성공 뒤 숨긴다", async () => {
    let resolve!: () => void;
    const onAcknowledge = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    render(<StaffCallAlert calls={[call]} onAcknowledge={onAcknowledge} />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect((screen.getByRole("button", { name: /처리 중/ }) as HTMLButtonElement).disabled).toBe(true);
    resolve();
    await waitFor(() => expect(screen.queryByText(/#007/)).toBeNull());
  });

  it("확인 실패 시 호출을 유지하고 재시도 안내를 표시한다", async () => {
    const onAcknowledge = vi.fn().mockRejectedValueOnce(new Error("network"));
    render(<StaffCallAlert calls={[call]} onAcknowledge={onAcknowledge} />);
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다시 시도"));
    expect(screen.getByText(/#007/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "확인" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
