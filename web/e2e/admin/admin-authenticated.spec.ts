import { test, expect } from "@playwright/test";
import { DEMO } from "../fixtures/demo-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Admin authenticated — real backend", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("categories page renders the real admin shell and edit modal", async ({ page }) => {
    await page.goto("/admin/categories");

    await expect(page.locator("header")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(DEMO.name).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Menu categories|Categorie menu/i })).toBeVisible();
    await expect(page.getByText(/Starters|Antipasti/i).first()).toBeVisible();
    await expect(page.getByText(/Main courses|Secondi/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /New category|Nuova categoria/i })).toBeVisible();

    await page.locator("button[title='Edit'], button[title='Modifica']").first().click();
    await expect(page.getByRole("heading", { name: /Edit category|Modifica categoria/i })).toBeVisible();
    await page.getByRole("button", { name: /Cancel|Annulla/i }).click();
    await expect(page.getByRole("heading", { name: /Edit category|Modifica categoria/i })).not.toBeVisible();
  });

  test("entries, hours, settings, and analytics routes load without the old seam", async ({ page }) => {
    await page.goto("/admin/items?category=demo-cat-starters");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /ANTIPASTI|STARTERS/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Bruschetta/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Application error");

    for (const path of ["/admin/hours", "/admin/settings/profile"]) {
      await page.goto(path);
      await expect(page.locator("header")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("body")).not.toContainText("Application error");
    }

    await page.goto("/admin/analytics");
    await expect(page.locator('[role="group"]')).toBeVisible({ timeout: 15000 });
  });

  test("sidebar navigation uses real routes", async ({ page }) => {
    await page.goto("/admin/categories");
    await expect(page.getByText(DEMO.name).first()).toBeVisible({ timeout: 15000 });

    for (const href of ["/admin/categories", "/admin/items", "/admin/hours", "/admin/analytics", "/admin/settings/profile"]) {
      await expect(page.locator(`a[href*='${href}']`).first()).toBeVisible();
    }

    await page.locator("a[href*='/admin/hours']").first().click();
    await expect(page).toHaveURL(/\/admin\/hours\/?$/, { timeout: 8000 });
  });
});
