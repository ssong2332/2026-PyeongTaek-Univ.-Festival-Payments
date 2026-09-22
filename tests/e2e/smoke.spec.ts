import { expect, test } from "@playwright/test";

test("T-01 smoke: / 접속 시 200 + <html lang> 존재", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", /.+/);
});
