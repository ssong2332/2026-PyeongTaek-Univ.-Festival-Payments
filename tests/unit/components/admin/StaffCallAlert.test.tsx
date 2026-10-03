// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StaffCallAlert } from "@/components/admin/StaffCallAlert";
import type { StaffCallDto } from "@/lib/dto/staffCall";

describe("T-27 StaffCallAlert Component", () => {
  it("미확인 호출이 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <StaffCallAlert calls={[]} onAcknowledge={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("모두 확인 완료된 호출만 있으면 렌더링하지 않는다", () => {
    const calls: StaffCallDto[] = [
      {
        id: "call-1",
        orderId: "order-1",
        pickupNumber: 5,
        calledAt: "2026-10-04T12:00:00.000Z",
        acknowledgedAt: "2026-10-04T12:01:00.000Z",
        acknowledgedBy: "admin-1",
      },
    ];

    const { container } = render(
      <StaffCallAlert calls={calls} onAcknowledge={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("미확인 호출이 있으면 픽업 번호와 확인 버튼을 렌더링하고, 클릭 시 onAcknowledge를 호출한다", () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    const calls: StaffCallDto[] = [
      {
        id: "call-1",
        orderId: "order-1",
        pickupNumber: 7,
        calledAt: "2026-10-04T12:00:00.000Z",
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
    ];

    render(<StaffCallAlert calls={calls} onAcknowledge={onAcknowledge} />);

    expect(screen.getByText(/픽업/)).toBeDefined();
    expect(screen.getByText(/#007/)).toBeDefined();
    expect(screen.getByText(/직원을 호출했습니다/)).toBeDefined();

    const button = screen.getByRole("button", { name: "확인" });
    fireEvent.click(button);

    expect(onAcknowledge).toHaveBeenCalledWith("call-1");
  });
});
