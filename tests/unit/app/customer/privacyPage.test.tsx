// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/(customer)/privacy/page";
import { setLocale } from "@/lib/i18n/locale";

afterEach(() => {
  cleanup();
  setLocale("ko");
});

describe("/privacy — 개인정보 고지 1차 (T-12, F-12·N-15)", () => {
  it("이름·전화번호 미입력과 실제 처리 항목을 구분해 보여준다", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("개인정보 고지");
    const collected = screen.getByRole("region", { name: "주문 관련 정보" });
    expect(collected.textContent).toContain("이름·전화번호 입력 없음");
    expect(collected.textContent).toContain("주문 상태 확인용 토큰");
    expect(collected.textContent).toContain("IP 주소에서 만든 주문 제한 키");
    expect(collected.textContent).toContain("별점과 입력한 내용");
    expect(screen.getByRole("heading", { level: 2, name: "이름·전화번호 없이 주문해요" })).toBeTruthy();
  });

  it("기기에 저장하는 주문 링크·픽업 번호·후기 표시와 24시간 뒤 정리 시점을 알린다", () => {
    render(<PrivacyPage />);

    const device = screen.getByRole("region", { name: "이 기기에만 보관" });
    expect(device.textContent).toContain("24시간");
    expect(device.textContent).toContain("현황 링크·픽업 번호와 후기 제출 표시");
    expect(device.textContent).toContain("24시간이 지난 기록은 관련 화면을 다시 열 때 삭제");
    expect(device.textContent).toContain("별도로 서버에 보내지 않습니다.");
  });

  it("지난 파기 예정일과 최신 비삭제 결정을 구분해 보여준다", () => {
    render(<PrivacyPage />);

    const disposal = screen.getByRole("region", { name: "서버 주문 기록" });
    expect(disposal.textContent).toContain("주문 기록 보관 중");
    expect(disposal.textContent).toContain("2026-11-08");
    expect(disposal.textContent).toContain("2026-11-23");
    expect(disposal.textContent).toContain("2026-11-24");
    expect(disposal.textContent).toContain("이번 개인정보 파기 작업에서 주문 데이터를 삭제하지 않기로 결정");
    expect(disposal.textContent).toContain("새 파기 일정은 정해지지 않았습니다");
    expect(screen.getByText(/기기 기록과 서버 주문 기록의 현재 보관 상태/)).toBeTruthy();
  });

  it("영어 안내도 현재 보관 상태와 비삭제 결정을 명시한다", () => {
    setLocale("en");
    render(<PrivacyPage />);

    const disposal = screen.getByRole("region", { name: "Server order records" });
    expect(disposal.textContent).toContain("Order records retained");
    expect(disposal.textContent).toContain("decided not to delete order data");
    expect(disposal.textContent).toContain("No new deletion date has been set");
    const collected = screen.getByRole("region", { name: "Order-related information" });
    expect(collected.textContent).toContain("No name or phone number entered");
    expect(collected.textContent).toContain("order status token");
    expect(collected.textContent).toContain("rate-limit key derived from your IP address");
  });

  it("동의 체크·입력·버튼이 없다 — 별도 동의 단계 0개", () => {
    const { container } = render(<PrivacyPage />);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelectorAll("form, input, textarea, select")).toHaveLength(0);
  });
});
