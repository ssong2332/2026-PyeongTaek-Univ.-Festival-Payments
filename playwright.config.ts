import { defineConfig, devices } from "@playwright/test";
import { resolveE2eSupabase } from "./tests/e2e/support/localSupabase";

// E2E는 로컬 Supabase에서만 실행한다(ADR-0007, T-24). 주소가 127.0.0.1·localhost가 아니면 여기서 멈춰
// 개발 서버도 뜨지 않는다. 아래 webServer.env가 .env.local(운영 DB) 값을 로컬 값으로 덮어쓴다.
const supabase = resolveE2eSupabase();

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
        env: supabase.serverEnv,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
