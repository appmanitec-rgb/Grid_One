import { defineConfig, devices } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_URL || "http://127.0.0.1:3000";
const appBaseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3001";
const shouldStartWebServer = process.env.E2E_SKIP_WEBSERVER !== "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: appBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
  webServer: shouldStartWebServer
    ? [
        {
          command: "npm --prefix ../backend run start",
          url: `${apiBaseUrl}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            APP_BASE_URL: appBaseUrl,
            FRONTEND_URL: appBaseUrl,
          },
        },
        {
          command: "npm run dev",
          url: appBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NEXT_PUBLIC_API_URL: apiBaseUrl,
          },
        },
      ]
    : undefined,
});
