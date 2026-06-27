/**
 * Palette picker E2E — runs against the seeded DEMO_MODE backend.
 *
 * The palette card lives on the Profile settings page; selecting a swatch
 * live-previews via CSS vars and persists through "Salva Modifiche", which the
 * public menu's ThemeProvider then applies.
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PROFILE = "/admin/settings/profile";

const PALETTES = {
  terracotta: { primary: "#cc9166" },
  forest: { primary: "#4a7c59" },
  slate: { primary: "#4a6480" },
};

const saveButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /salva modifiche/i });

test.describe("Palette picker — admin settings", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");
  // These tests mutate the single global restaurant theme, so they must not
  // run concurrently with each other.
  test.describe.configure({ mode: "serial" });

  test("palette card renders all 7 swatches on the profile page", async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Tavolozza").first()).toBeVisible({ timeout: 15000 });

    for (const name of ["Terracotta", "Forest", "Slate", "Aubergine", "Rose", "Charcoal", "Saffron"]) {
      await expect(page.locator(`button[title="${name}"]`)).toBeVisible();
    }
  });

  test("clicking a swatch immediately updates CSS vars (live preview)", async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState("networkidle");

    await page.locator('button[title="Forest"]').click();

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim() ||
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );
    expect(primary).toBe(PALETTES.forest.primary);
  });

  test("selected palette label is bold", async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState("networkidle");

    await page.locator('button[title="Slate"]').click();

    const slateLabel = page.locator('button[title="Slate"] span').last();
    const fontWeight = await slateLabel.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(["700", "bold"]).toContain(fontWeight);
  });

  test("save persists palette — reload applies correct CSS vars", async ({ page }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState("networkidle");

    await page.locator('button[title="Slate"]').click();
    await saveButton(page).click();
    await page.waitForTimeout(1500);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000); // allow ThemeProvider to fire

    const primary = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );
    expect(primary).toBe(PALETTES.slate.primary);

    // Restore terracotta so other specs see the default.
    await page.locator('button[title="Terracotta"]').click();
    await saveButton(page).click();
    await page.waitForTimeout(1000);
  });

  test("saved palette is reflected on the public menu page", async ({ page, context }) => {
    await page.goto(PROFILE);
    await page.waitForLoadState("networkidle");
    await page.locator('button[title="Forest"]').click();
    await saveButton(page).click();
    await page.waitForTimeout(1500);

    const menuPage = await context.newPage();
    // The public menu polls/streams, so networkidle can hang — wait for the
    // ThemeProvider to apply the CSS var instead.
    await menuPage.goto("/en/menu/");
    await menuPage.waitForFunction(
      (expected) =>
        document.documentElement.style.getPropertyValue("--color-primary").trim() === expected,
      PALETTES.forest.primary,
      { timeout: 15000 },
    );

    const primary = await menuPage.evaluate(() =>
      document.documentElement.style.getPropertyValue("--color-primary").trim()
    );
    expect(primary).toBe(PALETTES.forest.primary);
    await menuPage.close();

    // Restore terracotta.
    await page.locator('button[title="Terracotta"]').click();
    await saveButton(page).click();
    await page.waitForTimeout(1000);
  });
});
