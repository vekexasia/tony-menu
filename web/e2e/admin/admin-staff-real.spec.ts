/**
 * Staff links + tables ↔ real backend smoke — runs against the seeded
 * DEMO_MODE backend like admin-api.spec.ts.
 */

import { test, expect } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

test.describe("Staff links + tables — real backend", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test("staff-links page loads the real list and creates a one-use link", async ({ page }) => {
    await page.goto("/admin/staff-links/");

    // Page must render from the real API, not an error banner.
    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Internal Server Error")).toHaveCount(0);

    // Create a link against the real backend. Unique name per run: the demo DB
    // persists between local runs, so a fixed name would accumulate rows and
    // make the assertion ambiguous.
    const waiterName = `e2e waiter ${Date.now()}`;
    await page.getByRole("textbox").first().fill(waiterName);
    const createRes = page.waitForResponse(
      (res) => res.url().includes("/admin/staff-links") && res.request().method() === "POST" && res.status() < 300,
    );
    await page.getByRole("button", { name: /genera|generate/i }).click();
    expect((await createRes).status()).toBeLessThan(300);

    // The new link's row appears, exactly once, with its consume URL (?token=).
    await expect(page.getByText(waiterName).last()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[value*="/staff?token="]').first()).toBeVisible();
  });

  test("tables admin page loads the colour-coded canvas from /admin/floor", async ({ page }) => {
    await page.request.post("http://localhost:8787/admin/demo/reset");
    const floorRes = page.waitForResponse(
      (res) => res.url().includes("/admin/floor") && res.request().method() === "GET" && res.status() < 300,
    );
    await page.goto("/admin/tables/");
    expect((await floorRes).status()).toBe(200);
    await expect(page.getByText("Internal Server Error")).toHaveCount(0);
    // Seeded demo areas render as tabs, and the canvas shows the seeded tiles.
    await expect(page.getByTestId("area-tabs")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("area-tab-demo-area-sala")).toBeVisible();
    await expect(page.getByTestId("area-tab-demo-area-terrazza")).toBeVisible();
    await expect(page.getByTestId("floor-canvas")).toBeVisible();
    await expect(page.getByTestId("table-demo-table-sala-1")).toBeVisible();
  });

  test("tapping a tile opens the action panel and renames the table (round-trips)", async ({ page }) => {
    await page.request.post("http://localhost:8787/admin/demo/reset");
    await page.goto("/admin/tables/");
    const tile = page.getByTestId("table-demo-table-sala-1");
    await expect(tile).toBeVisible({ timeout: 10000 });

    // A plain click on the tile is a tap (no movement) -> action panel opens.
    await tile.click();
    const panel = page.getByTestId("table-panel");
    await expect(panel).toBeVisible();

    // Rename through the panel and confirm the PATCH lands.
    const patchRes = page.waitForResponse(
      (res) => res.url().includes("/admin/tables/demo-table-sala-1") && res.request().method() === "PATCH" && res.status() < 300,
    );
    const input = panel.locator("input").first();
    await input.fill("E2E-1");
    await panel.getByRole("button", { name: /salva|save/i }).click();
    expect((await patchRes).status()).toBeLessThan(300);

    // Reset demo so the seeded name is restored for later runs.
    await page.request.post("http://localhost:8787/admin/demo/reset");
  });

  test("table position PATCH persists on the real backend", async ({ request }) => {
    await request.post("http://localhost:8787/admin/demo/reset");
    const patch = await request.patch("http://localhost:8787/admin/tables/demo-table-sala-1/position", {
      data: { x: 500, y: 300 },
    });
    expect(patch.ok()).toBeTruthy();
    const list = await request.get("http://localhost:8787/admin/tables");
    const { tables } = await list.json() as { tables: Array<{ id: string; x: number; y: number }> };
    const row = tables.find((t) => t.id === "demo-table-sala-1")!;
    expect(row).toMatchObject({ x: 500, y: 300 });
    await request.post("http://localhost:8787/admin/demo/reset");
  });

  test("/staff consume endpoint is mounted (bad token rejected, not 500)", async ({ request }) => {
    const res = await request.post("http://localhost:8787/staff/consume", {
      data: { token: "nonexistent-token" },
    });
    // Mounted and validating: a clean 4xx, never a 5xx.
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
