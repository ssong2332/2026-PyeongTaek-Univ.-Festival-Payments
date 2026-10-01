// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderStatusBadge } from "@/components/customer/OrderStatusBadge";
import { ORDER_STATUSES, type OrderStatus } from "@/domain/order/status";

afterEach(cleanup);

// PRD F-10·F-14의 상태 7종 한국어 표기
const EXPECTED_LABELS: Record<OrderStatus, string> = {
  pending: "결제대기",
  paid: "결제확인",
  cooking: "조리중",
  completed: "완료",
  cancelled: "취소",
  refunded: "환불",
  expired: "만료",
};

describe("OrderStatusBadge (F-14)", () => {
  it.each(Object.entries(EXPECTED_LABELS) as [OrderStatus, string][])("%s → '%s'", (status, label) => {
    render(<OrderStatusBadge status={status} />);

    const badge = screen.getByText(label);
    expect(badge.textContent).toBe(label);
    expect(badge.getAttribute("data-status")).toBe(status);
  });

  it.each(["pending", "paid", "cooking", "completed"] as const)("진행 중 상태(%s)는 active 톤(캡처 12 색)", (status) => {
    const { container } = render(<OrderStatusBadge status={status} />);

    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("active");
  });

  it.each(["cancelled", "refunded", "expired"] as const)("종료 상태(%s)는 같은 모양의 closed 톤(회색)", (status) => {
    const { container } = render(<OrderStatusBadge status={status} />);

    expect(container.firstElementChild?.getAttribute("data-tone")).toBe("closed");
  });

  it("도메인 상태 7종 모두 서로 다른 라벨로 그린다", () => {
    const labels = ORDER_STATUSES.map((status) => {
      const { container, unmount } = render(<OrderStatusBadge status={status} />);
      const text = container.textContent;
      unmount();
      return text;
    });

    expect(labels).toHaveLength(7);
    expect(new Set(labels).size).toBe(7);
    expect(labels.every((label) => label !== null && label.length > 0)).toBe(true);
  });
});
