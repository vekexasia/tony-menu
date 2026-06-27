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

  test("should display location section with the seeded address", async ({ page }) => {
    const locationSection = page.locator("section", {
      has: page.getByRole("heading", { name: "DOVE SIAMO" }),
    });
    await expect(locationSection).toBeVisible();
    await expect(locationSection.getByText(DEMO.addressLine1)).toBeVisible();
    // City line includes zip and region, e.g. "30100 Venezia (VE)".
    await expect(locationSection.getByText(new RegExp(`${DEMO.city}.*\\(${DEMO.region}\\)`))).toBeVisible();
  });

  test("should display contacts section with the seeded phone", async ({ page }) => {
    const contactsSection = page.locator("section", {
      has: page.getByRole("heading", { name: "CONTATTI" }),
    });
    await expect(contactsSection).toBeVisible();
    // Call link points at the seeded phone number.
    await expect(contactsSection.locator(`a[href="tel:${DEMO.phone}"]`)).toBeVisible();
    await expect(contactsSection.getByText(DEMO.phone)).toBeVisible();
  });

  test("should display opening hours section with all days", async ({ page }) => {
    const hoursSection = page.locator("section", {
      has: page.getByRole("heading", { name: "ORARI DI APERTURA" }),
    });
    await expect(hoursSection).toBeVisible();
    for (const day of ["LUNEDÌ", "MARTEDÌ", "MERCOLEDÌ", "GIOVEDÌ", "VENERDÌ", "SABATO", "DOMENICA"]) {
      await expect(hoursSection.getByText(day)).toBeVisible();
    }
    // The seed leaves one weekday with no slots, which renders as "closed".
    if (DEMO.hasClosedDay) {
      await expect(hoursSection.getByText("CHIUSO")).toBeVisible();
    }
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

  test("should render the data-driven sections as white cards", async ({ page }) => {
    // Wait for the store-backed content to mount before counting.
    await expect(page.getByRole("heading", { name: "ORARI DI APERTURA" })).toBeVisible();
    const sections = page.locator("section.bg-white.rounded-lg.p-4.shadow-sm");
    // Demo data drives location + contacts + opening hours (no intro message).
    expect(await sections.count()).toBeGreaterThanOrEqual(3);
  });

  test("should have proper page structure", async ({ page }) => {
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("header")).toBeVisible();

    await expect(page.getByRole("heading", { name: "ORARI DI APERTURA" })).toBeVisible();
    const sections = page.locator("section");
    expect(await sections.count()).toBeGreaterThanOrEqual(3);
  });
});
