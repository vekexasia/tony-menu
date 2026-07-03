import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// The Next dev server reads NEXT_PUBLIC_DEFAULT_LOCALE from .env.local, but the
// Playwright test process does not. Load Next env here so locale assertions see
// the same default the server redirects to.
loadEnvConfig(__dirname, true); // dev=true: match `next dev` env file precedence

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/chat-live*", "**/fixtures/auth-setup*"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
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
        // iPhone 13 defaults to webkit, whose system deps (libgtk-4, gstreamer,
        // libavif) need root to install. These specs test viewport behaviour,
        // not engine quirks — chromium keeps them runnable everywhere.
        browserName: "chromium",
      },
      testMatch: [
        "**/home.spec.ts",
        "**/chat.spec.ts",
        "**/i18n.spec.ts",
        "**/menu-route.spec.ts",
      ],
    },
  ],
});
