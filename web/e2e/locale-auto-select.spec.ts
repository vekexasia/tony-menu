import { test, expect } from "@playwright/test";

// Default locale is set per-environment via NEXT_PUBLIC_DEFAULT_LOCALE
// ("en" locally, "it" in CI). Derive it so fallback assertions hold in both.
const DEFAULT_LOCALE = process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "en";
const DEFAULT_LOCALE_URL = new RegExp(`/${DEFAULT_LOCALE}(/|$)`);

test.describe("stored preference", () => {
  test("stored preferred-locale wins", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("preferred-locale", "de");
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/de(\/|$)/);
  });
});

test.describe("browser fr-FR", () => {
  test.use({ locale: "fr-FR" });

  test("browser language match", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/fr(\/|$)/);
  });

  test("stored beats browser", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("preferred-locale", "de");
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/de(\/|$)/);
  });
});

test.describe("browser de-AT", () => {
  test.use({ locale: "de-AT" });

  test("region subtag maps to base", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/de(\/|$)/);
  });
});

test.describe("browser ja-JP", () => {
  test.use({ locale: "ja-JP" });

  test("default fallback", async ({ page }) => {
    // ja not in the static locale list; falls back to NEXT_PUBLIC_DEFAULT_LOCALE.
    await page.goto("/");
    await expect(page).toHaveURL(DEFAULT_LOCALE_URL);
  });
});
