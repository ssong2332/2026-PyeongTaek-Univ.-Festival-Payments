// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MyOrderLinks } from "@/components/customer/MyOrderLinks";

afterEach(cleanup);

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "0123456789abcdef".repeat(4);

describe("MyOrderLinks — 메뉴판 '내 주문 현황 보기' (#89)", () => {
    it("빈 값: 주문이 없으면 아무것도 그리지 않는다(빈 자리도 남기지 않음)", () => {
        const { container } = render(<MyOrderLinks orders={[]} />);

        expect(container.innerHTML).toBe("");
        expect(screen.queryByText("내 주문 현황 보기")).toBeNull();
    });

    it("받은 순서(최신순) 그대로 줄마다 3자리 픽업 번호와 /orders/{토큰} 링크", () => {
        render(
            <MyOrderLinks
                orders={[
                    { statusToken: TOKEN_B, pickupNumber: 12 },
                    { statusToken: TOKEN_A, pickupNumber: 5 },
                ]}
            />,
        );

        const region = screen.getByRole("region", { name: "내 주문 현황 보기" });
        const links = within(region).getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([`/orders/${TOKEN_B}`, `/orders/${TOKEN_A}`]);
        expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
            "픽업 번호 012 주문 현황 보기",
            "픽업 번호 005 주문 현황 보기",
        ]);
        expect(links[0].textContent).toContain("012");
        expect(links[1].textContent).toContain("005");
    });

    it("경계: 픽업 번호 1은 001, 네 자리는 자르거나 쉼표를 넣지 않는다(완료 화면 표기와 같음)", () => {
        render(
            <MyOrderLinks
                orders={[
                    { statusToken: TOKEN_A, pickupNumber: 1 },
                    { statusToken: TOKEN_B, pickupNumber: 1234 },
                ]}
            />,
        );

        expect(screen.getByRole("link", { name: "픽업 번호 001 주문 현황 보기" }).textContent).toContain("001");
        const fourDigits = screen.getByRole("link", { name: "픽업 번호 1234 주문 현황 보기" });
        expect(fourDigits.textContent).toContain("1234");
        expect(fourDigits.textContent).not.toContain("1,234");
    });
});
