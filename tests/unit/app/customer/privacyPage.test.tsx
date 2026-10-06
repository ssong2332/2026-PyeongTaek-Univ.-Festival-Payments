// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/(customer)/privacy/page";

afterEach(cleanup);

describe("/privacy — 개인정보 고지 1차 (T-12, F-12·N-15)", () => {
  it("제목과 '수집하는 개인정보: 없음'을 보여준다", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("개인정보 고지");
    const collected = screen.getByRole("region", { name: "수집하는 개인정보" });
    expect(collected.textContent).toContain("없음");
    expect(collected.textContent).toContain("개인정보를 수집하지 않습니다");
  });

  it("이 기기에 주문 현황 링크·픽업 번호를 24시간 보관하고 서버로 보내지 않는다고 알린다 (#89, DECISIONS #54)", () => {
    render(<PrivacyPage />);

    const device = screen.getByRole("region", { name: "이 기기에만 보관" });
    expect(device.textContent).toContain("24시간");
    expect(device.textContent).toContain("이 기기에 최근 주문의 현황 링크와 픽업 번호를 24시간 보관합니다.");
    expect(device.textContent).toContain("서버로 보내지 않습니다.");
  });

  it("주문 데이터 파기 시점 2026-11-08(축제 종료 2026-10-08 후 한 달)을 보여준다", () => {
    render(<PrivacyPage />);

    const disposal = screen.getByRole("region", { name: "주문 데이터 파기" });
    expect(disposal.textContent).toContain("2026-11-08");
    expect(disposal.textContent).toContain("2026-10-08");
  });

  it("동의 체크·입력·버튼이 없다 — 별도 동의 단계 0개", () => {
    const { container } = render(<PrivacyPage />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("form, input, textarea, select")).toHaveLength(0);
  });
});
