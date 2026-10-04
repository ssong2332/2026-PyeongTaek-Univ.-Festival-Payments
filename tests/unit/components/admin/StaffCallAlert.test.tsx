// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StaffCallAlert } from "@/components/admin/StaffCallAlert";
import type { StaffCallDto } from "@/lib/dto/staffCall";

const call: StaffCallDto = { id: "call-1", orderId: "order-1", pickupNumber: 7, calledAt: "2026-10-04T12:00:00.000Z", acknowledgedAt: null, acknowledgedBy: null };

describe("T-27 StaffCallAlert", () => {
  it("미확인 호출이 없으면 빈 상태를 표시한다", () => { render(<StaffCallAlert calls={[]} onAcknowledge={vi.fn()} />); expect(screen.getByText("직원 호출 알림 없음")).toBeTruthy(); });
  it("호출을 확인하면 처리 중을 표시하고 성공 뒤 숨긴다", async () => { let resolve!: () => void; const onAcknowledge = vi.fn(() => new Promise<void>((done) => { resolve = done; })); render(<StaffCallAlert calls={[call]} onAcknowledge={onAcknowledge} />); fireEvent.click(screen.getByRole("button", { name: "확인" })); expect(screen.getByRole("button", { name: /처리 중/ })).toBeDisabled(); resolve(); await waitFor(() => expect(screen.queryByText(/#007/)).toBeNull()); });
  it("확인 실패 시 호출을 유지하고 재시도 안내를 표시한다", async () => { const onAcknowledge = vi.fn().mockRejectedValueOnce(new Error("network")); render(<StaffCallAlert calls={[call]} onAcknowledge={onAcknowledge} />); fireEvent.click(screen.getByRole("button", { name: "확인" })); await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다시 시도")); expect(screen.getByText(/#007/)).toBeTruthy(); expect(screen.getByRole("button", { name: "확인" })).not.toBeDisabled(); });
});
