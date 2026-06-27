import { test, expect } from "@playwright/test";

// NOTE: the root <html lang> is fixed to the default locale (app/layout.tsx),
// so locale is asserted via the URL and the localized content that renders,
// not the html lang attribute.

test.describe("Internationalization (i18n)", () => {
  test.describe("Italian locale (/it)", () => {
    test("should load Italian locale at /it", async ({ page }) => {
      await page.goto("/it");
      await expect(page).toHaveURL(/\/it\/?$/);
    });

    test("should display Italian menu titles on home page", async ({ page }) => {
      await page.goto("/it");
      // Localized published-menu titles from the seed (it).
      await expect(page.getByText("Menu cibo")).toBeVisible();
      await expect(page.getByText("Bevande")).toBeVisible();
    });

    test("should display Italian text on info page", async ({ page }) => {
      await page.goto("/it/info");

      // Section headings that render for the demo (no intro message, no geo
      // coordinates, so IL RISTORANTE and the map link do not appear).
      await expect(page.getByText("INFO RISTORANTE")).toBeVisible();
      await expect(page.getByText("DOVE SIAMO")).toBeVisible();
      await expect(page.getByText("CONTATTI")).toBeVisible();
      await expect(page.getByText("ORARI DI APERTURA")).toBeVisible();
      await expect(page.getByText("Chiama")).toBeVisible();
    });

    test("should display Italian day names on info page", async ({ page }) => {
      await page.goto("/it/info");

      // Check Italian day names
      await expect(page.getByText("LUNEDÌ")).toBeVisible();
      await expect(page.getByText("MARTEDÌ")).toBeVisible();
      await expect(page.getByText("MERCOLEDÌ")).toBeVisible();
      await expect(page.getByText("GIOVEDÌ")).toBeVisible();
      await expect(page.getByText("VENERDÌ")).toBeVisible();
      await expect(page.getByText("SABATO")).toBeVisible();
      await expect(page.getByText("DOMENICA")).toBeVisible();
      await expect(page.getByText("CHIUSO")).toBeVisible();
    });
  });

  test.describe("English locale (/en)", () => {
    test("should load English locale at /en", async ({ page }) => {
      await page.goto("/en");
      await expect(page).toHaveURL(/\/en\/?$/);
    });

    test("should display English menu titles on home page", async ({ page }) => {
      await page.goto("/en");
      // Default-locale (en) menu titles from the seed.
      await expect(page.getByText("Food menu")).toBeVisible();
      await expect(page.getByText("Drinks")).toBeVisible();
    });

    test("should display English text on info page", async ({ page }) => {
      await page.goto("/en/info");

      // Headings that render for the demo (no intro, no map link).
      await expect(page.getByText("RESTAURANT INFOS")).toBeVisible();
      await expect(page.getByText("LOCATION")).toBeVisible();
      await expect(page.getByText("CONTACTS")).toBeVisible();
      await expect(page.getByText("OPENING HOURS")).toBeVisible();
      await expect(page.getByText("Call")).toBeVisible();
    });

    test("should display English day names on info page", async ({ page }) => {
      await page.goto("/en/info");

      // Check English day names
      await expect(page.getByText("MONDAY")).toBeVisible();
      await expect(page.getByText("TUESDAY")).toBeVisible();
      await expect(page.getByText("WEDNESDAY")).toBeVisible();
      await expect(page.getByText("THURSDAY")).toBeVisible();
      await expect(page.getByText("FRIDAY")).toBeVisible();
      await expect(page.getByText("SATURDAY")).toBeVisible();
      await expect(page.getByText("SUNDAY")).toBeVisible();
      await expect(page.getByText("CLOSED")).toBeVisible();
    });
  });

  test.describe("German locale (/de)", () => {
    test("should load German locale at /de", async ({ page }) => {
      await page.goto("/de");
      await expect(page).toHaveURL(/\/de\/?$/);
    });

    test("should display German menu titles on home page", async ({ page }) => {
      await page.goto("/de");
      // Food menu has a German title in the seed; Drinks falls back to default.
      await expect(page.getByText("Speisekarte")).toBeVisible();
    });

    test("should display German text on info page", async ({ page }) => {
      await page.goto("/de/info");

      // Headings that render for the demo (no intro, no map link).
      await expect(page.getByText("WO WIR SIND")).toBeVisible();
      await expect(page.getByText("KONTAKTE")).toBeVisible();
      await expect(page.getByText("ÖFFNUNGSZEIT")).toBeVisible();
      await expect(page.getByText("Anruf")).toBeVisible();
    });
  });

  test.describe("Locale switching", () => {
    test("should maintain same page content structure across locales", async ({
      page,
    }) => {
      // Wait for the client to mount on each locale before counting, otherwise
      // the count can race the React mount and read 0.
      const countMain = async (path: string) => {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        return page.locator("main").count();
      };

      const itSections = await countMain("/it");
      const enSections = await countMain("/en");
      const deSections = await countMain("/de");

      expect(itSections).toBe(enSections);
      expect(enSections).toBe(deSections);
    });

    test("should have consistent header structure across locales", async ({
      page,
    }) => {
      // Italian
      await page.goto("/it");
      await expect(page.locator("header h1")).toBeVisible();

      // English
      await page.goto("/en");
      await expect(page.locator("header h1")).toBeVisible();

      // German
      await page.goto("/de");
      await expect(page.locator("header h1")).toBeVisible();
    });

    test("info page should have same number of sections across locales", async ({
      page,
    }) => {
      // Wait for the store-backed sections to mount on each locale before counting.
      const countSections = async (path: string) => {
        await page.goto(path);
        await expect(page.locator("section").first()).toBeVisible();
        return page.locator("section").count();
      };

      const itSectionCount = await countSections("/it/info");
      const enSectionCount = await countSections("/en/info");
      const deSectionCount = await countSections("/de/info");

      expect(itSectionCount).toBe(enSectionCount);
      expect(enSectionCount).toBe(deSectionCount);
    });
  });

  test.describe("Default locale behavior", () => {
    test("should redirect root to default locale (Italian)", async ({
      page,
    }) => {
      await page.goto("/");

      // Should redirect to Italian as default
      await expect(page).toHaveURL(/\/(it)?\/?$/);
    });
  });
});
