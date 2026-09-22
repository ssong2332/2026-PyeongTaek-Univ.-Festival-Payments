import { expect, test } from "@playwright/test";

test("첫 화면은 정상 응답하고 문서 언어는 한국어다", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
});
