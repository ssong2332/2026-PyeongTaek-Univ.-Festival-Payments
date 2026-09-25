import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:3100",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "customer-android", use: { ...devices["Pixel 7"], browserName: "chromium" } },
        { name: "customer-ios", use: { ...devices["iPhone 14"], browserName: "chromium" } },
        { name: "admin-desktop", use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
