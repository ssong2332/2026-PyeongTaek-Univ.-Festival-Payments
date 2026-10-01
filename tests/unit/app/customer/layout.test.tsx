// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CustomerLayout from "@/app/(customer)/layout";

afterEach(cleanup);

describe("고객 레이아웃", () => {
    it("F-12: 어느 고객 화면에서든 개인정보 안내(/privacy)로 1탭 링크", () => {
        render(<CustomerLayout><p>본문</p></CustomerLayout>);
        expect(screen.getByText("본문")).toBeTruthy();
        expect(screen.getByRole("link", { name: "개인정보 안내" }).getAttribute("href")).toBe("/privacy");
    });
});
