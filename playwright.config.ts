import { defineConfig, devices } from "@playwright/test";

// 브라우저는 전부 chromium — 고객 프로젝트 2개는 기기 에뮬레이션만 다르다 (Architecture "테스트 전략").
const chromium = { browserName: "chromium" } as const;

export default defineConfig({
    testDir: "tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://localhost:3000",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "customer-pixel7", use: { ...devices["Pixel 7"], ...chromium } },
        { name: "customer-iphone14", use: { ...devices["iPhone 14"], ...chromium } },
        { name: "admin-desktop", use: { ...devices["Desktop Chrome"], ...chromium } },
    ],
    webServer: {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
