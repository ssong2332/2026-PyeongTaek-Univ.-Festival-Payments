// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderJourney } from "@/components/customer/OrderJourney";

afterEach(cleanup);

describe("OrderJourney — 담기 → 결제 → 픽업", () => {
    it.each([
        [0, "담기"],
        [1, "결제"],
        [2, "픽업"],
    ] as const)("단계 %i이면 '%s'가 지금 단계", (step, label) => {
        const { container } = render(<OrderJourney step={step} />);
        expect(screen.getByRole("group", { name: "주문 단계" })).toBeTruthy();
        const current = container.querySelector("[aria-current='step']");
        expect(current?.textContent).toContain(label);
        expect(container.querySelectorAll("[aria-current]")).toHaveLength(1);
        // 화면의 실제 목록(장바구니 항목)과 섞이지 않게 목록 역할이 없다
        expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    });
});
