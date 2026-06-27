import { test, expect } from "@playwright/test";

/**
 * Verifies that the AI chat panel is gated behind the features.aiChat flag.
 *
 * We test two cases:
 *  - Without ?aiChat=1: FAB must NOT appear (feature flag is off / not set in Firestore)
 *  - With    ?aiChat=1: FAB MUST appear (dev override enables it)
 *
 * This indirectly confirms the Firestore feature-flag path works, because the same
 * condition `(data?.features?.aiChat === true || aiChatDevOverride)` governs both.
 */
test.describe("Chat feature toggle", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("promo_seen_demo-restaurant", "1");
    });
  });

  test("FAB is hidden when aiChat feature flag is off", async ({ page }) => {
    await page.goto("/it/menu");

    // Wait for the menu to render (spinner gone = React hydrated + data loaded)
    const spinner = page.locator('.animate-spin');
    await expect(spinner).toHaveCount(0, { timeout: 15000 });

    const fab = page.locator('button[aria-label="Open chat"]');
    // FAB should not be in the DOM at all
    await expect(fab).toHaveCount(0, { timeout: 3000 });
  });

  test("FAB is visible with dev override ?aiChat=1", async ({ page }) => {
    await page.goto("/it/menu?aiChat=1");

    const fab = page.locator('button[aria-label="Open chat"]');
    await expect(fab).toBeVisible({ timeout: 8000 });
  });

  test("chat panel opens and closes correctly with feature enabled", async ({
    page,
  }) => {
    await page.goto("/it/menu?aiChat=1");

    const fab = page.locator('button[aria-label="Open chat"]');
    await expect(fab).toBeVisible({ timeout: 8000 });

    // Open
    await fab.dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Close" })).toBeVisible();

    // Close — FAB re-appears
    await page.locator('button[aria-label="Close"]').dispatchEvent("click");
    await expect(fab).toBeVisible({ timeout: 5000 });
  });
});
