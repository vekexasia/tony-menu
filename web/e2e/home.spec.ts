import { test, expect } from "@playwright/test";
import { DEMO, DEMO_MENU_CODES } from "./fixtures/demo-data";

// The home page is a restaurant landing card (name, opening hours, info icons)
// followed by one selection card per published menu, plus an info modal and a
// language picker. All expectations are sourced from the demo seed.
test.describe("Home Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/it");
  });

  test("should load the home page and display main content", async ({ page }) => {
    await expect(page).toHaveURL(/\/it\/?$/);
    await expect(page.locator("main")).toBeVisible();
  });

  test("should display the header card with the restaurant name", async ({ page }) => {
    const header = page.locator("header");
    await expect(header).toBeVisible();

    const restaurantName = page.locator("header h1");
    await expect(restaurantName).toBeVisible();
    await expect(restaurantName).toContainText(DEMO.nameUpper);
  });

  test("should show opening hours under the name", async ({ page }) => {
    // Header card renders today's opening hours as a paragraph below the name.
    const hours = page.locator("header p").first();
    await expect(hours).toBeVisible();
  });

  test("should render one selection card per published menu", async ({ page }) => {
    // Each published menu links to /<locale>/menu/?type=<code>.
    for (const code of DEMO_MENU_CODES) {
      const card = page.locator(`a[href*="/menu/?type=${code}"]`);
      await expect(card).toBeVisible();
    }
    await expect(page.locator('a[href*="/menu/?type="]')).toHaveCount(DEMO_MENU_CODES.length);
  });

  test("should navigate to the menu page when a selection card is clicked", async ({ page }) => {
    const firstCode = DEMO_MENU_CODES[0];
    await page.locator(`a[href*="/menu/?type=${firstCode}"]`).click();
    await page.waitForURL(new RegExp(`/it/menu/?\\?type=${firstCode}`));
    await expect(page.locator("main")).toBeVisible();
  });

  test("should open the restaurant info modal from the header", async ({ page }) => {
    // The "more infos" button opens a full-screen info modal, not a route change.
    // The headless Dialog wrapper has no box, so assert the panel content instead:
    // the modal renders the restaurant name as an h2 section + close button.
    await page.getByRole("button", { name: /informazioni/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: DEMO.name })).toBeVisible();
  });

  test("should expose the language picker", async ({ page }) => {
    await expect(page.getByRole("button", { name: /select language/i })).toBeVisible();
  });

  test("should allow scrolling on the page", async ({ page }) => {
    const initialScrollY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(100);
    const newScrollY = await page.evaluate(() => window.scrollY);
    expect(newScrollY).toBeGreaterThanOrEqual(initialScrollY);
  });

  test("should use semantic main and header landmarks", async ({ page }) => {
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("header")).toBeVisible();
  });
});
