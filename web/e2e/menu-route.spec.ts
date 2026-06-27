/**
 * Menu route E2E test.
 *
 * This project is single-tenant (see the initial open-source release): there is
 * only the /[locale]/menu route, no /[locale]/[restaurantSlug]/menu route. The
 * earlier multi-tenant slug tests were removed because that route does not exist.
 */

import { test, expect } from "@playwright/test";

function routeResolved(page: import("@playwright/test").Page) {
  // The client mounts either the Suspense/loading spinner or the menu <main>.
  const spinner = page.locator(".animate-spin").first();
  const main = page.locator("main").first();
  return expect(spinner.or(main)).toBeVisible({ timeout: 15000 });
}

test.describe("Menu route", () => {
  test("/it/menu resolves and mounts the client", async ({ page }) => {
    const resp = await page.goto("/it/menu");
    expect(resp?.status() ?? 0).toBeLessThan(400);
    await routeResolved(page);
  });

  test("/en/menu resolves (English locale)", async ({ page }) => {
    const resp = await page.goto("/en/menu");
    expect(resp?.status() ?? 0).toBeLessThan(400);
    await routeResolved(page);
  });
});
