/**
 * Admin ↔ D1 API E2E — runs against the seeded DEMO_MODE backend.
 *
 * DEMO_MODE bypasses Cloudflare Access (/admin/me returns an admin), so the
 * admin SPA loads real data from the D1-backed API with no auth.json or seam.
 * Verifies the admin app talks to the local API (not the old Firestore path).
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Admin — D1 API", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("admin loads the catalog from the local API", async ({ page }) => {
    const catalogReq = page.waitForRequest(
      (req) => req.url().includes("localhost:8787") && req.url().includes("/admin/catalog"),
      { timeout: 15000 },
    );

    await page.goto("/admin");

    const req = await catalogReq;
    expect(req.url()).toContain("/admin/catalog");
  });

  test("categories page loads the list from D1", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Not the access-denied / invalid-session gate.
    await expect(page.getByRole("heading", { name: "Categorie menu" })).toBeVisible({ timeout: 15000 });

    // Seeded categories render with edit controls.
    await expect(page.locator("button[title='Modifica']").first()).toBeVisible({ timeout: 10000 });
  });

  test("items page loads for the first category", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const categoryLink = page.locator("a[href*='/admin/items/?category=']").first();
    await categoryLink.waitFor({ timeout: 15000 });
    await categoryLink.click();

    await expect(page).toHaveURL(/\/admin\/items\/?\?category=/, { timeout: 10000 });
    await page.waitForLoadState("networkidle");
    // The items page renders the seeded entries for the category (no auth gate / crash).
    await expect(page.getByRole("heading", { level: 4 }).first()).toBeVisible({ timeout: 10000 });
  });
});
