/**
 * D1 catalog integration tests.
 *
 * Verifies the frontend loads catalog data from D1 correctly:
 * - Prices are in euros (e.g. 4.5) not integer cents (e.g. 450)
 * - Categories and entries render
 * - No JS console errors from the API layer
 *
 * Requires: wrangler dev on port 8787 + Next.js dev on port 3000
 * with NEXT_PUBLIC_API_URL=http://localhost:8787.
 */

import { test, expect } from "@playwright/test";

const BACKEND = "http://localhost:8787";
const CATALOG_URL = `${BACKEND}/catalog`;

test.describe("D1 catalog — backend API", () => {
  test("catalog endpoint returns 200 with menu data", async ({ request }) => {
    const resp = await request.get(CATALOG_URL);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.menus).toBeDefined();
    expect(body.menus.length).toBeGreaterThan(0);
    expect(body.restaurant.name).toBeTruthy();
  });

  test("all prices are euros not integer cents", async ({ request }) => {
    const resp = await request.get(CATALOG_URL);
    const body = await resp.json();

    const allEntries = body.categories.flatMap(
      (c: { entries: { name: string; price: number }[] }) => c.entries
    );

    expect(allEntries.length).toBeGreaterThan(0);

    for (const entry of allEntries as { name: string; price: number }[]) {
      expect(entry.price).toBeGreaterThanOrEqual(0);
      // No menu item costs more than €200 — if we see e.g. 450 it's a cents bug
      expect(entry.price).toBeLessThan(200);
    }
  });

  test("catalog source header is live-db or r2-snapshot", async ({
    request,
  }) => {
    const resp = await request.get(CATALOG_URL);
    const source = resp.headers()["x-catalog-source"];
    expect(["live-db", "r2-snapshot", "cache-api"]).toContain(source);
  });

  test("health endpoint reports D1 database configured", async ({
    request,
  }) => {
    const resp = await request.get(`${BACKEND}/ready`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.ready).toBe(true);
    expect(body.checks.databaseConfigured).toBe(true);
  });
});

test.describe("D1 catalog — frontend", () => {
  test("home page loads and shows menu content", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/it");
    // Use 'domcontentloaded' — 'networkidle' hangs on pages with polling
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("main")).toBeVisible({ timeout: 15000 });

    // Filter to real API errors (ignore third-party noise)
    const apiErrors = consoleErrors.filter(
      (e) =>
        (e.includes("localhost:8787") ||
          e.includes("catalog") ||
          e.includes("ApiError")) &&
        !e.includes("favicon")
    );
    expect(apiErrors).toHaveLength(0);
  });

  test("frontend hits localhost:8787 for catalog (not Firestore)", async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("localhost:8787")) {
        apiRequests.push(req.url());
      }
    });

    await page.goto("/it");
    await page.waitForLoadState("domcontentloaded");
    // Give React a moment to fire the catalog fetch
    await page.waitForTimeout(3000);

    const catalogHits = apiRequests.filter((u) => u.includes("/catalog"));
    expect(catalogHits.length).toBeGreaterThan(0);
  });

  test("no price looks like raw cents on the menu page", async ({ page }) => {
    await page.goto("/it");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    const pageText = await page.locator("body").innerText();
    // Prices like "€450" or "€1200" would be cents-not-euros bugs
    const suspiciousPrices = pageText.match(/€\s*[1-9]\d{2,}/g) ?? [];
    expect(suspiciousPrices).toHaveLength(0);
  });
});
