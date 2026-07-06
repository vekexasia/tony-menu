import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Admin items page — real backend", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("sidebar Items opens all items and filters by item name", async ({ page }) => {
    await page.goto("/admin/categories");
    await expect(page.locator("header")).toBeVisible({ timeout: 15000 });

    await page.locator("a[href*='/admin/items']").first().click();
    await expect(page).toHaveURL(/\/admin\/items\/?$/);
    await expect(page.locator("h2")).toContainText(/ALL ITEMS|TUTTI GLI ARTICOLI/);

    await expect(page.getByRole("heading", { name: /Bruschetta/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Tiramis/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Prosecco/i })).toBeVisible();

    await page.locator("input[placeholder]").fill("brus");

    await expect(page.getByRole("heading", { name: /Bruschetta/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tiramis/i })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: /Prosecco/i })).not.toBeVisible();
  });
});
