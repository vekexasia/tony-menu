/**
 * Admin publish toggle E2E — runs against the seeded DEMO_MODE backend.
 *
 * The publish control lives on the Publishing settings page and toggles
 * publication via PUT /admin/publication.
 */

import { test, expect, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const PUBLISHING = "/admin/settings/publishing";

// The publication state is a single global flag on the shared backend; other
// specs (chat, menu) read it concurrently. Never let the PUT reach the real
// backend — fulfill it at the network layer so the UI behaves identically but
// the seeded state is untouched.
async function mockPublicationPut(page: Page) {
  await page.route("**/admin/publication", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
      : route.continue(),
  );
}

test.describe("Admin publish toggle", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");
  test.beforeEach(async ({ page }) => {
    await mockPublicationPut(page);
  });

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
  });
});
