import { test, expect } from '@playwright/test';
import {
  API_URL,
  addBruschettaFromMenu,
  createStaffLink,
  createTable,
  resetDemo,
  revokeStaffLink,
  setE2eIp,
  setOrdering,
} from './fixtures/real-backend';

test.describe.serial('Waiter mode — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'both' });
  });

  test('consuming a staff link stores a session and shows the floor', async ({ page, request }) => {
    await setE2eIp(page);
    const table = await createTable(request, `E2E Floor ${Date.now()}`);
    const link = await createStaffLink(request, 'Marco');

    await page.goto(`/staff?token=${link.token}`);

    await expect(page.getByTestId('floor-grid')).toBeVisible();
    await expect(page.getByTestId(`table-${table.id}`)).toContainText(table.name);
    await expect(page).toHaveURL(/\/staff\/?$/);
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toEqual(expect.any(String));
  });

  test('no session shows the "ask the personnel" gate', async ({ page }) => {
    await page.goto('/staff');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
  });

  test('revoked session is locked out', async ({ page, request }) => {
    await setE2eIp(page);
    await createTable(request);
    const link = await createStaffLink(request, 'Revoked waiter');
    await page.goto(`/staff?token=${link.token}`);
    await expect(page.getByTestId('floor-grid')).toBeVisible();

    await revokeStaffLink(request, link.id);
    await page.goto('/staff');

    await expect(page.getByTestId('staff-denied')).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toBeNull();
  });

  test('diner opening /order-review without a staff session is blocked', async ({ page }) => {
    await page.goto('/order-review?token=some-token');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
    await expect(page.getByRole('button', { name: /invia ordine/i })).toHaveCount(0);
  });

  test('takes an order for a table, appends another, and shows the table name on the kitchen board', async ({ page, request }) => {
    await setE2eIp(page);
    const table = await createTable(request, `E2E Table ${Date.now()}`);
    const link = await createStaffLink(request, 'Marco');

    await page.goto(`/staff?token=${link.token}`);
    const tile = page.getByTestId(`table-${table.id}`);
    await expect(tile).toBeVisible();
    const openRes = page.waitForResponse((res) => res.url().includes(`/staff/tables/${table.id}/session`) && res.request().method() === 'POST' && res.status() < 300);
    await tile.click();
    const { sessionId } = await (await openRes).json() as { sessionId: string };

    await page.goto(`/staff/table/${sessionId}`);
    await expect(page.getByTestId('add-order')).toHaveAttribute('href', new RegExp(`selection\\/?\\?staffSession=${sessionId}`));

    await addBruschettaFromMenu(page);
    await setE2eIp(page);
    await page.goto(`/it/selection?staffSession=${sessionId}`);

    const orderReq = page.waitForRequest((req) => req.url().includes('/orders') && req.method() === 'POST');
    const orderRes = page.waitForResponse((res) => res.url().includes('/orders') && res.request().method() === 'POST' && res.status() === 200);
    await page.getByRole('button', { name: /invia ordine/i }).click();
    const body = (await orderReq).postDataJSON() as { tableSessionId?: string };
    expect(body.tableSessionId).toBe(sessionId);
    await orderRes;

    await expect(page).toHaveURL(new RegExp(`/staff/table/${sessionId}/?$`));
    await expect(page.getByTestId('order-1')).toContainText(/bruschetta/i);

    await expect(page.getByTestId('add-order')).toHaveAttribute('href', new RegExp(`selection\\/?\\?staffSession=${sessionId}`));

    await page.goto('/admin/orders');
    const card = page.getByTestId('order-1');
    await expect(card).toBeVisible();
    await expect(card).toContainText(table.name);
  });
});
