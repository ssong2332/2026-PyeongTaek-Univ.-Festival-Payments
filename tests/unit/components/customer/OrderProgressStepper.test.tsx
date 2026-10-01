// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderProgressStepper, type ProgressStatus } from "@/components/customer/OrderProgressStepper";

afterEach(cleanup);

const STEP_LABELS = ["주문 접수됨", "결제 완료", "호떡 굽는 중", "완성! 수령해주세요"];

function stepStates(): (string | null)[] {
  return screen.getAllByRole("listitem").map((item) => item.getAttribute("data-state"));
}

function currentStepText(): string | null {
  const current = screen.getAllByRole("listitem").filter((item) => item.getAttribute("aria-current") === "step");
  expect(current).toHaveLength(1);
  return current[0].textContent;
}

describe("OrderProgressStepper — 4단계(pending→paid→cooking→completed)", () => {
  it("단계 이름 4개를 순서대로 보여준다", () => {
    render(<OrderProgressStepper status="pending" />);

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    items.forEach((item, index) => expect(item.textContent).toContain(STEP_LABELS[index]));
  });

  it.each([
    ["pending", ["current", "upcoming", "upcoming", "upcoming"], "주문 접수됨"],
    ["paid", ["done", "current", "upcoming", "upcoming"], "결제 완료"],
    // 현금 주문은 pending → cooking으로 바로 넘어간다 — 결제 완료 단계를 거치지 않았어도 완료로 표시
    ["cooking", ["done", "done", "current", "upcoming"], "호떡 굽는 중"],
    ["completed", ["done", "done", "done", "current"], "완성! 수령해주세요"],
  ] as [ProgressStatus, string[], string][])("%s → 단계 상태 %j, 현재 단계 '%s'", (status, states, currentLabel) => {
    render(<OrderProgressStepper status={status} />);

    expect(stepStates()).toEqual(states);
    expect(currentStepText()).toContain(currentLabel);
  });

  it("진행 중인 단계에만 '진행 중...'을 붙이고, 완성 단계(completed)에는 붙이지 않는다", () => {
    const { unmount } = render(<OrderProgressStepper status="cooking" />);
    expect(screen.getAllByText("진행 중...")).toHaveLength(1);
    expect(currentStepText()).toContain("진행 중...");
    unmount();

    render(<OrderProgressStepper status="completed" />);
    expect(screen.queryByText("진행 중...")).toBeNull();
  });
});
