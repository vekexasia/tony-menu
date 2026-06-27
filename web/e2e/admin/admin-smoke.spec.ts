import { test, expect } from "@playwright/test";

/**
 * Admin area smoke tests.
 *
 * Auth model in this build is Cloudflare Access (production) plus a DEMO_MODE
 * bypass on the backend used by e2e: there is no in-app Firebase/Google login
 * card. Against the seeded DEMO_MODE backend, /me returns a demo admin, so
 * /admin loads the admin shell directly (the Categories page).
 */
test.describe("Admin smoke", () => {
  test("/admin loads the admin shell", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 5000 });
    await expect(page.locator("header")).toBeVisible({ timeout: 10000 });
  });

  test("admin home renders the categories page heading", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Categorie", { timeout: 10000 });
  });

  test("does not render a Firebase/Google login card", async ({ page }) => {
    await page.goto("/admin");
    // The legacy Google sign-in card was removed with the move to Cloudflare Access.
    await expect(page.locator("button").filter({ hasText: /Google/i })).toHaveCount(0);
  });
});
