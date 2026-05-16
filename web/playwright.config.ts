import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/chat-live*", "**/fixtures/auth-setup*"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "NEXT_IGNORE_INCORRECT_LOCKFILE=1 npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [
    // One-time auth setup — run manually before admin tests:
    //   npx playwright test --project=auth-setup
    {
      name: "auth-setup",
      testMatch: "**/fixtures/auth-setup.ts",
      use: {
        ...devices["Desktop Chrome"],
        headless: false, // must be headed so you can log in with Google
        launchOptions: { slowMo: 300 },
      },
    },
    // Main test suite
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // auth-setup not listed as dependency — admin tests skip themselves
      // if auth.json is missing, so CI doesn't break
    },
    // Mobile viewport — runs a subset of specs at 375x812 (iPhone-class width).
    // Enable with: npx playwright test --project=mobile
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
      },
      testMatch: [
        "**/home.spec.ts",
        "**/chat.spec.ts",
        "**/i18n.spec.ts",
        "**/multi-tenant-menu.spec.ts",
      ],
    },
  ],
});
