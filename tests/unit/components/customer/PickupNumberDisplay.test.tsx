// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PickupNumberDisplay } from "@/components/customer/PickupNumberDisplay";

afterEach(cleanup);

describe("PickupNumberDisplay (F-09)", () => {
  it.each(["tile", "header"] as const)("'픽업 번호' 영역에 번호를 3자리로 보여준다 (%s)", (variant) => {
    render(<PickupNumberDisplay pickupNumber={42} variant={variant} />);

    const region = screen.getByRole("region", { name: "픽업 번호" });
    expect(region.textContent).toContain("042");
  });

  it("가장 작은 번호 1은 앞을 0으로 채워 001", () => {
    render(<PickupNumberDisplay pickupNumber={1} />);

    expect(screen.getByText("001")).toBeTruthy();
  });

  it("세 자리 번호는 그대로 150", () => {
    render(<PickupNumberDisplay pickupNumber={150} />);

    expect(screen.getByText("150")).toBeTruthy();
  });

  it("네 자리 이상은 자르지 않고, 천 단위 쉼표도 넣지 않는다 — 부스에서 부르는 번호와 같게", () => {
    render(<PickupNumberDisplay pickupNumber={1234} />);

    expect(screen.getByText("1234")).toBeTruthy();
    expect(screen.queryByText("1,234")).toBeNull();
  });
});
