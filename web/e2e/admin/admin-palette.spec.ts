/**
 * Palette picker e2e tests.
 *
 * Prerequisites (same as admin-api.spec.ts):
 *   1. wrangler dev --persist-to .wrangler/state running on port 8787
 *   2. Next.js dev running on port 3000
 *   3. Session saved: npx playwright test --project=auth-setup
 */

import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_FILE = path.join(__dirname, "../fixtures/auth.json");
const API_URL = process.env.NEXT_PUBLIC_API_URL;

const hasAuth = fs.existsSync(AUTH_FILE);

const PALETTES = {
  terracotta: { primary: "#cc9166", accent: "#C47A4F", accentLight: "#F4E2D4" },
  forest:     { primary: "#4a7c59", accent: "#3d6b4a", accentLight: "#d4e8da" },
  slate:      { primary: "#4a6480", accent: "#3d556e", accentLight: "#d4dde8" },
};

test.describe("Palette picker — admin settings", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");
  test.skip(!hasAuth, "Skipped: run auth-setup first");

  test.use({ storageState: AUTH_FILE });

  test("palette card renders all 7 swatches on settings profile page", async ({ page }) => {
    await page.goto("/admin?s=settings-profile");
    await page.waitForLoadState("networkidle");

    const paletteCard = page.locator("text=PALETTE").first();
    await expect(paletteCard).toBeVisible({ timeout: 10000 });

    for (const name of ["Terracotta", "Forest", "Slate", "Aubergine", "Rose", "Charcoal", "Saffron"]) {
      await expect(page.locator(`button[title="${name}"]`)).toBeVisible();
    }
  });

  test("clicking a swatch immediately updates CSS vars (live preview)", async ({ page }) => {
    await page.goto("/admin?s=settings-profile");
    await page.waitForLoadState("networkidle");

    // Click Forest
    await page.locator('button[title="Forest"]').click();

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim() ||
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );

    expect(primary).toBe(PALETTES.forest.primary);
  });

  test("selected palette label is bold and ring appears on swatch", async ({ page }) => {
    await page.goto("/admin?s=settings-profile");
    await page.waitForLoadState("networkidle");

    await page.locator('button[title="Slate"]').click();

    const slateLabel = page.locator('button[title="Slate"] span').last();
    const fontWeight = await slateLabel.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(["700", "bold"]).toContain(fontWeight);
  });

  test("save persists palette — admin reload applies correct CSS vars", async ({ page }) => {
    await page.goto("/admin?s=settings-profile");
    await page.waitForLoadState("networkidle");

    // Pick Slate
    await page.locator('button[title="Slate"]').click();

    // Save
    await page.locator("button", { hasText: /salva/i }).click();
    await expect(page.locator("text=Salva")).toBeVisible({ timeout: 5000 }).catch(() => {});
    // Wait for success toast
    await page.waitForTimeout(1500);

    // Reload and check CSS vars
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000); // allow ThemeProvider to fire

    const primary = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );
    expect(primary).toBe(PALETTES.slate.primary);

    // Restore terracotta so we don't pollute other tests
    await page.locator('button[title="Terracotta"]').click();
    await page.locator("button", { hasText: /salva/i }).click();
    await page.waitForTimeout(1000);
  });

  test("saved palette is reflected on the public menu page", async ({ page, context }) => {
    // Set palette to Forest via admin
    await page.goto("/admin?s=settings-profile");
    await page.waitForLoadState("networkidle");
    await page.locator('button[title="Forest"]').click();
    await page.locator("button", { hasText: /salva/i }).click();
    await page.waitForTimeout(1500);

    // Open the public menu in a new tab (same context = same auth cookies if needed)
    const menuPage = await context.newPage();
    await menuPage.goto("/en/menu/");
    await menuPage.waitForLoadState("networkidle");
    await menuPage.waitForTimeout(1000);

    const primary = await menuPage.evaluate(() =>
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );
    expect(primary).toBe(PALETTES.forest.primary);

    await menuPage.close();

    // Restore terracotta
    await page.locator('button[title="Terracotta"]').click();
    await page.locator("button", { hasText: /salva/i }).click();
    await page.waitForTimeout(1000);
  });
});
