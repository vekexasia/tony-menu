import { test, expect, type Page } from '@playwright/test';
import { MOCK_RESTAURANT, MOCK_USER, MOCK_RESTAURANT_ID } from './fixtures/admin-mock';

/**
 * Waiter mode (#15). Backend is mocked at the network layer (same approach as
 * order-intent-handoff.spec.ts): floor view, staff link consume, ordering for a
 * table, the staff gate on /order-review, and revoked-session lockout.
 */

const RESTAURANT_WAITER = {
  ...MOCK_RESTAURANT,
  features: {
    ...(MOCK_RESTAURANT.features ?? {}),
    aiChat: false,
    aiVoice: false,
    ordering: { enabled: true, mode: 'send' as const, submitMode: 'both' as const },
  },
};

const SESSION = 'staff-session-e2e';

async function seedRestaurant(page: Page) {
  await page.addInitScript((restaurant) => {
    window.__playwright_restaurant__ = restaurant as never;
  }, RESTAURANT_WAITER);
}

async function seedStaffSession(page: Page) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('tony-menu-staff-session', token);
  }, SESSION);
}

test.describe('Waiter mode', () => {
  test('consuming a staff link stores a session and shows the floor', async ({ page }) => {
    await seedRestaurant(page);
    await page.route('**/staff/consume', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sessionToken: SESSION, name: 'Marco' }),
    }));
    await page.route('**/staff/floor', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ tables: [
        { id: 't1', name: 'Table 1', sessionId: null, openedAt: null, orderCount: 0, readyCount: 0 },
      ] }),
    }));

    await page.goto('/staff?token=link-token-xyz');

    await expect(page.getByTestId('floor-grid')).toBeVisible();
    await expect(page.getByTestId('table-t1')).toContainText('Table 1');
    // One-use token cleaned out of the URL.
    await expect(page).toHaveURL(/\/staff\/?$/);
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toBe(SESSION);
  });

  test('no session shows the "ask the personnel" gate', async ({ page }) => {
    await seedRestaurant(page);
    await page.goto('/staff');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
  });

  test('revoked session is locked out', async ({ page }) => {
    await seedRestaurant(page);
    await seedStaffSession(page);
    // The session-check endpoint rejects a revoked session.
    await page.route('**/staff/session', (route) => route.fulfill({
      status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }),
    }));

    await page.goto('/staff');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
    // Invalid session cleared from storage.
    expect(await page.evaluate(() => window.localStorage.getItem('tony-menu-staff-session'))).toBeNull();
  });

  test('diner opening /order-review without a staff session is blocked', async ({ page }) => {
    await seedRestaurant(page);
    await page.goto('/order-review?token=some-token');
    await expect(page.getByTestId('staff-denied')).toBeVisible();
    // No submit button leaks to the diner.
    await expect(page.getByRole('button', { name: /invia ordine/i })).toHaveCount(0);
  });

  test('taking an order for a table submits with the session, then it shows on the kitchen board with the table name', async ({ page }) => {
    await seedRestaurant(page);
    await seedStaffSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('tony-menu-selection-v1', JSON.stringify({
        version: 1,
        restaurantId: 'demo-restaurant',
        updatedAt: Date.now(),
        lines: [{ entryId: 'entry-bruschetta', quantity: 2, addedAt: Date.now() }],
      }));
    });
    await page.route('**/staff/session', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, name: 'Marco' }),
    }));
    // Table detail for session ts-1.
    await page.route('**/staff/sessions/ts-1', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        sessionId: 'ts-1', tableId: 't1', tableName: 'Table 1', openedAt: Date.now(), orders: [],
      }),
    }));

    let submitBody: { tableSessionId?: string; lines?: unknown[] } | null = null;
    let staffHeader: string | null = null;
    await page.route('**/orders', async (route) => {
      submitBody = route.request().postDataJSON();
      staffHeader = route.request().headers()['x-staff-session'] ?? null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, orderId: 'o1', dailyNumber: 7 }) });
    });

    // Enter the selection UI in staff context for the table.
    await page.goto('/it/selection?staffSession=ts-1');
    await page.getByRole('button', { name: /invia ordine/i }).click();

    // Submitted with the table session + staff header, then routed back to the table.
    await expect(page).toHaveURL(/\/staff\/table\/ts-1\/?$/);
    expect(submitBody!.tableSessionId).toBe('ts-1');
    expect(submitBody!.lines).toEqual([{ entryId: 'entry-bruschetta', quantity: 2 }]);
    expect(staffHeader).toBe(SESSION);

    // ── Same order now lands on the (admin-only) kitchen board with the table name ──
    await page.addInitScript(({ user, rid }) => {
      window.__playwright_admin__ = { user, restaurantId: rid };
    }, { user: MOCK_USER, rid: MOCK_RESTAURANT_ID });
    await page.route('**/admin/orders**', async (route) => {
      if (route.request().resourceType() === 'document') return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: 20260704, orders: [
        { id: 'o1', dailyNumber: 7, status: 'submitted', rejectReason: null, createdAt: Date.now(), tableName: 'Table 1', items: [{ id: 'i1', name: 'Bruschetta', price: 800, quantity: 2, destinations: [] }] },
      ] }) });
    });
    await page.route('**/admin/order-destinations**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ destinations: [] }) }));

    await page.goto('/admin/orders');
    const card = page.getByTestId('order-7');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Table 1');
  });

  test('appending a second order to the same session', async ({ page }) => {
    await seedRestaurant(page);
    await seedStaffSession(page);
    await page.route('**/staff/session', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, name: 'Marco' }),
    }));
    // Session already has one served order; the table detail lists it.
    await page.route('**/staff/sessions/ts-1', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        sessionId: 'ts-1', tableId: 't1', tableName: 'Table 1', openedAt: Date.now(),
        orders: [{ id: 'o1', dailyNumber: 7, status: 'served', createdAt: Date.now(), items: [{ id: 'i1', name: 'Bruschetta', price: 800, quantity: 2 }] }],
      }),
    }));

    await page.goto('/staff/table/ts-1');
    await expect(page.getByTestId('order-7')).toBeVisible();
    // "Add order" carries the session into the selection UI (append-only).
    const addOrder = page.getByTestId('add-order');
    await expect(addOrder).toHaveAttribute('href', /selection\/?\?staffSession=ts-1/);
  });
});
