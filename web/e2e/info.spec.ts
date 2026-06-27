import { test, expect } from "@playwright/test";
import { DEMO } from "./fixtures/demo-data";

test.describe("Info Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/it/info");
  });

  test("should load the info page at /it/info", async ({ page }) => {
    // Check that the page loads successfully
    await expect(page).toHaveURL(/\/it\/info\/?$/);

    // Check that the main element exists
    await expect(page.locator("main")).toBeVisible();
  });

  test("should display the info page header", async ({ page }) => {
    // Check the header is visible
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Check the page title in header
    const pageTitle = page.locator("header h1");
    await expect(pageTitle).toBeVisible();
    await expect(pageTitle).toContainText("INFO RISTORANTE");
  });

  test("should display back navigation button", async ({ page }) => {
    // Check that the back button (link to home) exists
    const backLink = page.locator('header a[href="/"]');
    await expect(backLink).toBeVisible();

    // Check that the back arrow SVG is present
    const backArrow = backLink.locator("svg");
    await expect(backArrow).toBeVisible();
  });

  test("should display restaurant section", async ({ page }) => {
    // The restaurant section is a card with the IL RISTORANTE heading and a
    // descriptive paragraph beneath it.
    const restaurantSection = page.locator("section", {
      has: page.getByRole("heading", { name: "IL RISTORANTE" }),
    });
    await expect(restaurantSection).toBeVisible();
    await expect(restaurantSection.locator("p").first()).toBeVisible();
  });

  test("should display location section", async ({ page }) => {
    // Check location section heading
    const locationHeading = page.locator("section h2").filter({
      hasText: "DOVE SIAMO",
    });
    await expect(locationHeading).toBeVisible();

    // Check address is displayed
    await expect(page.getByText("Via Example, 123")).toBeVisible();
    await expect(page.getByText("30016 Jesolo (VE)")).toBeVisible();

    // Check "See Map" button exists
    const seeMapButton = page.getByRole("button", { name: "Vedi Mappa" });
    await expect(seeMapButton).toBeVisible();
  });

  test("should display contacts section", async ({ page }) => {
    // Check contacts section heading
    const contactsHeading = page.locator("section h2").filter({
      hasText: "CONTATTI",
    });
    await expect(contactsHeading).toBeVisible();

    // Check call button exists
    const callButton = page.getByRole("button", { name: "Chiama" });
    await expect(callButton).toBeVisible();
  });

  test("should display opening hours section", async ({ page }) => {
    // Check opening hours section heading
    const hoursHeading = page.locator("section h2").filter({
      hasText: "ORARI DI APERTURA",
    });
    await expect(hoursHeading).toBeVisible();

    // Check days of the week are displayed
    await expect(page.getByText("LUNEDÌ")).toBeVisible();
    await expect(page.getByText("MARTEDÌ")).toBeVisible();
    await expect(page.getByText("MERCOLEDÌ")).toBeVisible();
    await expect(page.getByText("GIOVEDÌ")).toBeVisible();
    await expect(page.getByText("VENERDÌ")).toBeVisible();
    await expect(page.getByText("SABATO")).toBeVisible();
    await expect(page.getByText("DOMENICA")).toBeVisible();

    // Check that CHIUSO (closed) is displayed for some day
    await expect(page.getByText("CHIUSO")).toBeVisible();
  });

  test("should navigate back to home when clicking back button", async ({
    page,
  }) => {
    // Click the back button
    const backLink = page.locator('header a[href="/"]');
    await backLink.click();

    // Wait for navigation
    await page.waitForURL(/\/it\/?$/);

    // Verify we're on the home page
    await expect(page.locator("header h1")).toContainText(DEMO.nameUpper);
  });

  test("should have all sections in white cards with shadows", async ({
    page,
  }) => {
    // Check that sections are styled as cards
    const sections = page.locator("section.bg-white.rounded-lg.p-4.shadow-sm");
    const count = await sections.count();

    // There should be 4 main sections (restaurant, location, contacts, opening hours)
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("should have proper page structure", async ({ page }) => {
    // Check for semantic HTML elements
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("header")).toBeVisible();

    // Check sections exist
    const sections = page.locator("section");
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThanOrEqual(4);
  });
});
