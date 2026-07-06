import { test, expect } from '@playwright/test';
import {
  API_URL,
  dismissPopups,
  createStaffLink,
  resetDemo,
  revokeStaffLink,
  setOrdering,
  SEEDED_TABLE,
  SEEDED_AREA,
} from './fixtures/real-backend';

test.describe.serial('Waiter mode — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'both' });
  });

  test('consuming a staff link stores a session and shows the floor', async ({ page, request }) => {
    const link = await createStaffLink(request, 'Marco');

    await page.goto(`/staff?token=${link.token}`);

    await expect(page.getByTestId('floor-canvas')).toBeVisible();
    // Rides the demo seed: Sala 1 is one of the 10 seeded tables (short name '1' under area Sala).
    await expect(page.getByTestId(`table-${SEEDED_TABLE.id}`)).toContainText(SEEDED_TABLE.name);
    await expect(page).toHaveURL(/\/staff\/?$/);
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toEqual(expect.any(String));
  });

  test('no session shows the "ask the personnel" gate', async ({ page }) => {
    await page.goto('/staff');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
  });

  test('revoked session is locked out', async ({ page, request }) => {
    const link = await createStaffLink(request, 'Revoked waiter');
    await page.goto(`/staff?token=${link.token}`);
    await expect(page.getByTestId('floor-canvas')).toBeVisible();

    await revokeStaffLink(request, link.id);
    await page.goto('/staff');

    await expect(page.getByTestId('staff-denied')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toBeNull();
  });

  test('floor plan shows tiles per area tab and a tap opens the table page', async ({ page, request }) => {
    const link = await createStaffLink(request, 'Marco');
    await page.goto(`/staff?token=${link.token}`);
    await expect(page.getByTestId('floor-canvas')).toBeVisible();
    // Default (first) area tab is Sala; its seeded tables are visible.
    await expect(page.getByTestId(`area-tab-${SEEDED_AREA.id}`)).toBeVisible();
    const tile = page.getByTestId(`table-${SEEDED_TABLE.id}`);
    await expect(tile).toBeVisible();

    // Switch to Terrazza: Sala's tiles disappear, Terrazza's appear.
    await page.getByTestId('area-tab-demo-area-terrazza').click();
    await expect(page.getByTestId(`table-${SEEDED_TABLE.id}`)).toHaveCount(0);
    await expect(page.getByTestId('table-demo-table-terrazza-1')).toBeVisible();

    // Tap a table: opens a session and lands on the table page.
    await page.getByTestId('area-tab-demo-area-sala').click();
    await page.getByTestId(`table-${SEEDED_TABLE.id}`).click();
    await expect(page).toHaveURL(/\/staff\/table\/[^/]+\/?$/);
    await expect(page.getByTestId('add-order')).toBeVisible();
  });

  test('diner opening /order-review without a staff session is blocked', async ({ page }) => {
    await page.goto('/order-review?token=some-token');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
    await expect(page.getByRole('button', { name: /invia ordine/i })).toHaveCount(0);
  });

  test('takes an order for a table, appends another, and shows the table name on the kitchen board', async ({ page, request }) => {
    const table = SEEDED_TABLE;
    const link = await createStaffLink(request, 'Marco');

    await page.goto(`/staff?token=${link.token}`);
    const tile = page.getByTestId(`table-${table.id}`);
    await expect(tile).toBeVisible();
    const openRes = page.waitForResponse((res) => res.url().includes(`/staff/tables/${table.id}/session`) && res.request().method() === 'POST' && res.status() < 300);
    await tile.click();
    const { sessionId } = await (await openRes).json() as { sessionId: string };

    await page.goto(`/staff/table?sessionId=${sessionId}`);
    const addOrder = page.getByTestId('add-order');
    await expect(addOrder).toHaveAttribute('href', new RegExp(`menu\\/?\\?staffSession=${sessionId}`));
    await addOrder.click();
    await dismissPopups(page);
    await page.getByText(/bruschetta/i).first().click();
    await page.getByRole('button', { name: /aggiungi alla selezione|add to selection/i }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /la mia selezione|my selection/i }).click();

    const orderReq = page.waitForRequest((req) => req.url().includes('/orders') && req.method() === 'POST');
    const orderRes = page.waitForResponse((res) => res.url().includes('/orders') && res.request().method() === 'POST' && res.status() < 300 && ![301, 302, 303, 307, 308].includes(res.status()));
    await page.getByRole('button', { name: /invia ordine|send order/i }).click();
    const body = (await orderReq).postDataJSON() as { tableSessionId?: string };
    expect(body.tableSessionId).toBe(sessionId);
    const response = await orderRes;
    const responseText = await response.text();
    expect(responseText).toContain('"ok":true');
    expect(response.ok()).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`/staff/table/?\\?sessionId=${sessionId}`));
    const orderCard = page.locator('[data-testid^="order-"]').filter({ hasText: /bruschetta/i }).first();
    await expect(orderCard).toBeVisible();
    // Lifecycle changelog: the submitted event shows with time + actor.
    await expect(page.locator('[data-testid$="-events"]').first()).toContainText(/inviato|submitted/i);

    await expect(page.getByTestId('add-order')).toHaveAttribute('href', new RegExp(`menu\\/?\\?staffSession=${sessionId}`));

    await page.goto('/admin/orders');
    const card = page.locator('[data-testid^="order-"]').filter({ hasText: table.label }).first();
    await expect(card).toBeVisible();
  });
});
