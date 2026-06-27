/**
 * Admin CRUD smoke E2E — runs against the seeded DEMO_MODE backend.
 *
 * In DEMO_MODE the backend bypasses Cloudflare Access (/admin/me returns an
 * admin), so the admin SPA loads real demo data and CRUD calls hit the real D1
 * API — no auth.json or test seam required.
 *
 * Re-saves existing rows rather than creating/deleting, to keep the seeded
 * menu stable for other specs.
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Admin CRUD smoke", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("category list renders and shows at least one category", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Categorie menu" })).toBeVisible({ timeout: 15000 });

    const editButtons = page.locator("button[title='Modifica']");
    await expect(editButtons.first()).toBeVisible({ timeout: 10000 });
    expect(await editButtons.count()).toBeGreaterThan(0);
  });

  test("clicking a category navigates to its items page", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const categoryLink = page.locator("a[href*='/admin/items/?category=']").first();
    await categoryLink.waitFor({ timeout: 15000 });
    await categoryLink.click();

    await expect(page).toHaveURL(/\/admin\/items\/?\?category=/, { timeout: 10000 });
  });

  test("edit modal opens and closes without saving", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const editBtn = page.locator("button[title='Modifica']").first();
    await editBtn.waitFor({ timeout: 15000 });
    await editBtn.click();

    await expect(page.getByRole("heading", { name: "Modifica categoria" })).toBeVisible();
    await page.getByRole("button", { name: "Annulla" }).click();
    await expect(page.getByRole("heading", { name: "Modifica categoria" })).not.toBeVisible();
  });

  test("saving a category PUTs to the D1 backend", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    const putRequest = page.waitForRequest(
      (req) => /\/admin\/categories\/[^/]+$/.test(req.url()) && req.method() === "PUT",
      { timeout: 15000 },
    );

    const editBtn = page.locator("button[title='Modifica']").first();
    await editBtn.waitFor({ timeout: 15000 });
    await editBtn.click();

    // Re-save the existing name unchanged (stable for other specs).
    const nameInput = page.locator(".adm-input").first();
    const currentName = await nameInput.inputValue();
    await nameInput.fill(currentName);
    await page.getByRole("button", { name: "Salva modifiche" }).click();

    const req = await putRequest;
    expect(req.url()).toContain("localhost:8787");
  });
});
