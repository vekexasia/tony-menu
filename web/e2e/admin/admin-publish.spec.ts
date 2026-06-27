/**
 * Admin publish toggle E2E — runs against the seeded DEMO_MODE backend.
 *
 * The publish control lives on the Publishing settings page and toggles
 * publication via PUT /admin/publication.
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PUBLISHING = "/admin/settings/publishing";

test.describe("Admin publish toggle", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");
  // These tests toggle the single global publication state, so they must not
  // run concurrently with each other.
  test.describe.configure({ mode: "serial" });

  test("publishing settings page shows the publish toggle", async ({ page }) => {
    await page.goto(PUBLISHING);
    await page.waitForLoadState("networkidle");

    const toggle = page.getByRole("button", { name: /pubblica menu|nascondi menu/i });
    await expect(toggle).toBeVisible({ timeout: 15000 });
  });

  test("clicking the publish toggle hits PUT /admin/publication", async ({ page }) => {
    await page.goto(PUBLISHING);
    await page.waitForLoadState("networkidle");

    const putRequest = page.waitForRequest(
      (req) => req.url().includes("/admin/publication") && req.method() === "PUT",
      { timeout: 15000 },
    );

    const toggle = page.getByRole("button", { name: /pubblica menu|nascondi menu/i });
    await toggle.click();

    const req = await putRequest;
    expect(req.url()).toContain("localhost:8787");

    // Flip back so the seeded state is left unchanged for other specs.
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /pubblica menu|nascondi menu/i }).click();
    await page.waitForTimeout(800);
  });

  test("toggle label flips after clicking", async ({ page }) => {
    await page.goto(PUBLISHING);
    await page.waitForLoadState("networkidle");

    const toggle = page.getByRole("button", { name: /pubblica menu|nascondi menu/i });
    const initial = (await toggle.textContent())?.trim() ?? "";

    await toggle.click();
    await page.waitForTimeout(1200);

    const flipped = page.getByRole("button", { name: /pubblica menu|nascondi menu/i });
    expect((await flipped.textContent())?.trim() ?? "").not.toBe(initial);

    // Restore original state.
    await flipped.click();
    await page.waitForTimeout(1200);
  });
});
