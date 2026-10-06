// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CreditsPage from "@/app/(customer)/credits/page";
import { FESTIVAL_CREDITS } from "@/features/festival/festivalArt";

afterEach(cleanup);

// Flaticon 무료 라이선스: 쓴 그림마다 출처(원본 링크)를 보인다.
describe("/credits — 이미지 출처", () => {
    it("그림마다 원본 링크(새 창)와 작가를 보이고, 메뉴판으로 돌아가는 링크가 있다", () => {
        render(<CreditsPage />);
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("이미지 출처");
        const sources = screen.getAllByRole("link", { name: /원본 보기/ });
        expect(sources).toHaveLength(FESTIVAL_CREDITS.length);
        expect(sources[0].getAttribute("href")).toBe(FESTIVAL_CREDITS[0].url);
        expect(sources[0].getAttribute("target")).toBe("_blank");
        expect(screen.getAllByText(`Icon by ${FESTIVAL_CREDITS[0].author}`).length).toBeGreaterThan(0);
        expect(screen.getByRole("link", { name: "메뉴판으로" }).getAttribute("href")).toBe("/");
    });
});
