/**
 * Checks (conto, #15 follow-up) ↔ real backend. Seeds an open session with an
 * order via the API, then drives the admin table page: create check, discount,
 * settle. Also asserts the API refuses new orders while a check is open.
 */

import { test, expect } from "@playwright/test";
import {
  API_URL, resetDemo, setOrdering, createStaffLink, consumeStaffLinkApi,
  SEEDED_TABLE, e2eIp,
} from "../fixtures/real-backend";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** Open a session on the seeded table and submit one order into it. */
async function seedSessionWithOrder(request: import("@playwright/test").APIRequestContext) {
  const link = await createStaffLink(request, `e2e conto ${Date.now()}`);
  const { sessionToken } = await consumeStaffLinkApi(request, link.token);
  const openRes = await request.post(`${API_BASE}/staff/tables/${SEEDED_TABLE.id}/session`, { headers: { "X-Staff-Session": sessionToken } });
  expect(openRes.ok()).toBeTruthy();
  const { sessionId } = await openRes.json() as { sessionId: string };
  const submit = await request.post(`${API_BASE}/orders`, {
    headers: { "X-Staff-Session": sessionToken, "cf-connecting-ip": e2eIp() },
    data: { idempotencyKey: crypto.randomUUID(), lines: [{ entryId: "demo-entry-bruschetta", quantity: 2 }], tableSessionId: sessionId },
  });
  expect(submit.ok()).toBeTruthy();
  return { sessionId, sessionToken };
}

test.describe.serial("Checks (conto) — real backend", () => {
  test.skip(!API_URL, "Skipped: NEXT_PUBLIC_API_URL not set");

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: "send", submitMode: "both" });
  });

  test("create check, apply discount, settle → table free + settled in history", async ({ page, request }) => {
    await seedSessionWithOrder(request);

    // Tap the tile from the admin canvas → table page.
    await page.goto("/admin/tables/");
    const tile = page.getByTestId(`table-${SEEDED_TABLE.id}`);
    await expect(tile).toBeVisible({ timeout: 10000 });
    await tile.click();
    await expect(page).toHaveURL(new RegExp(`/admin/tables/detail/?\\?tableId=${SEEDED_TABLE.id}`));

    // The order shows in the session card.
    await expect(page.locator('[data-testid^="order-"]').filter({ hasText: /bruschetta/i }).first()).toBeVisible();

    // Create the check.
    const createRes = page.waitForResponse((res) => res.url().includes("/check") && res.request().method() === "POST" && res.status() < 300);
    await page.getByTestId("create-check").click();
    await createRes;
    await expect(page.getByTestId("check-card")).toBeVisible();
    await expect(page.getByTestId("add-items-blocked")).toContainText(/paga o annulla|settle or void/i);
    await expect(page.getByTestId("add-order")).toHaveCount(0);
    await expect(page.getByTestId("check-total")).toHaveText(/15,00/);

    // Apply a 10% discount; total updates to 13,50.
    const patchRes = page.waitForResponse((res) => /\/admin\/checks\/[^/]+\/?$/.test(res.url()) && res.request().method() === "PATCH" && res.status() < 300);
    const discount = page.getByTestId("discount-value");
    await discount.fill("10");
    await page.getByRole("button", { name: /salva|save/i }).click();
    await patchRes;
    await expect(page.getByTestId("check-total")).toHaveText(/13,50/);

    // Settle (confirm) → session closes, table free, settled in history.
    await page.getByTestId("settle").click();
    const settleRes = page.waitForResponse((res) => res.url().includes("/settle") && res.request().method() === "POST" && res.status() < 300);
    await page.getByTestId("settle-confirm").click();
    await settleRes;

    await expect(page.getByTestId("table-free")).toBeVisible();
    await expect(page.getByText("Pagato").first()).toBeVisible();
  });
  test("admin adds searchable items from the table page", async ({ page, request }) => {
    await seedSessionWithOrder(request);

    await page.goto(`/admin/tables/detail?tableId=${SEEDED_TABLE.id}`);
    await expect(page.getByTestId("add-order")).toBeVisible({ timeout: 10000 });
    const before = await page.locator('[data-testid^="order-"]').count();
    expect(before).toBeGreaterThan(0);
    await page.getByTestId("add-order").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /aggiungi articoli|add items/i })).toBeVisible({ timeout: 10000 });
    await page.getByTestId("admin-item-search").fill("prosecco");
    await expect(dialog.getByText(/prosecco/i).first()).toBeVisible();
    await expect(dialog.getByText(/bruschetta/i).first()).not.toBeVisible();
    await page.getByTestId("admin-item-plus-demo-entry-prosecco").click();

    const submitRes = page.waitForResponse((res) => res.url().includes("/admin/sessions/") && res.url().includes("/orders") && res.request().method() === "POST" && res.status() < 300);
    await page.getByTestId("submit-admin-order").click();
    await submitRes;

    await page.waitForFunction((n) => document.querySelectorAll('[data-testid^="order-"]').length > n, before, { timeout: 10000 });
  });

  test("API refuses new orders while a check is open (409 check_open)", async ({ request }) => {
    const { sessionId, sessionToken } = await seedSessionWithOrder(request);
    const createCheck = await request.post(`${API_BASE}/admin/sessions/${sessionId}/check`);
    expect(createCheck.ok()).toBeTruthy();

    const blocked = await request.post(`${API_BASE}/orders`, {
      headers: { "X-Staff-Session": sessionToken, "cf-connecting-ip": e2eIp() },
      data: { idempotencyKey: crypto.randomUUID(), lines: [{ entryId: "demo-entry-bruschetta", quantity: 1 }], tableSessionId: sessionId },
    });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json() as { error: string }).error).toBe("check_open");
  });
});
