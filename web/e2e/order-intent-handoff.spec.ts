import { test, expect, type Page } from '@playwright/test';
import { MOCK_RESTAURANT, MOCK_USER } from './fixtures/admin-mock';

/**
 * Waiter QR handoff (issue #19): the diner prepares an order and shows a QR
 * linking to /admin/order-review/?token=...; the waiter opens that link,
 * reviews the intent, and submits it. Backend endpoints are mocked at the
 * network layer (same approach as order-submit.spec.ts).
 */

const TOKEN = 'intent-token-e2e';

const RESTAURANT_WAITER = {
  ...MOCK_RESTAURANT,
  features: {
    ...(MOCK_RESTAURANT.features ?? {}),
    aiChat: false,
    aiVoice: false,
    ordering: { enabled: true, mode: 'send' as const, submitMode: 'waiter' as const },
  },
};

const PENDING_INTENT = {
  token: TOKEN,
  status: 'pending',
  expiresAt: Date.now() + 1_800_000,
  consumedAt: null,
  lines: [{ entryId: 'entry-bruschetta', quantity: 2, name: 'Bruschetta', price: 800, unavailable: false }],
};

async function setupDiner(page: Page) {
  await page.addInitScript((restaurant) => {
    window.__playwright_restaurant__ = restaurant as never;
    window.localStorage.clear();
    window.localStorage.setItem('tony-menu-selection-v1', JSON.stringify({
      version: 1,
      restaurantId: 'demo-restaurant',
      updatedAt: Date.now(),
      lines: [{ entryId: 'entry-bruschetta', quantity: 2, addedAt: Date.now() }],
    }));
  }, RESTAURANT_WAITER);
}

async function setupWaiter(page: Page) {
  await page.addInitScript(({ restaurant, user }) => {
    window.__playwright_admin__ = { user, restaurantId: 'demo-restaurant' };
    window.__playwright_restaurant__ = restaurant as never;
  }, { restaurant: RESTAURANT_WAITER, user: MOCK_USER });
}

test.describe('Waiter QR handoff', () => {
  test('diner creates an intent and shows a QR linking to the review page; waiter submits it', async ({ page, context }) => {
    // ── Diner side ──
    await setupDiner(page);
    let intentBody: { lines?: unknown[] } | null = null;
    await page.route('**/orders/intents', async (route) => {
      intentBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, token: TOKEN, expiresAt: Date.now() + 1_800_000 }),
      });
    });

    await page.goto('/it/selection');
    await page.getByRole('button', { name: /mostra qr al cameriere/i }).click();

    await expect(page.getByTestId('waiter-qr')).toBeVisible();
    expect(intentBody!.lines).toEqual([{ entryId: 'entry-bruschetta', quantity: 2 }]);
    // No full-cart payload in the QR — it encodes only a link with the token.
    const reviewPath = `/admin/order-review/?token=${TOKEN}`;

    // ── Waiter side (different page = different device) ──
    const waiterPage = await context.newPage();
    await setupWaiter(waiterPage);
    await waiterPage.route(`**/admin/order-intents/${TOKEN}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PENDING_INTENT),
    }));
    let consumed = false;
    await waiterPage.route(`**/admin/order-intents/${TOKEN}/consume`, async (route) => {
      consumed = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, orderId: 'order-1', dailyNumber: 5 }),
      });
    });

    await waiterPage.goto(reviewPath);
    await expect(waiterPage.getByText('Bruschetta')).toBeVisible();
    await waiterPage.getByRole('button', { name: /invia ordine/i }).click();

    await expect(waiterPage.getByTestId('order-daily-number')).toHaveText('#5');
    expect(consumed).toBe(true);
  });

  test('expired intent shows a clear error and no submit button', async ({ page }) => {
    await setupWaiter(page);
    await page.route(`**/admin/order-intents/${TOKEN}`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...PENDING_INTENT, status: 'expired' }),
    }));

    await page.goto(`/admin/order-review/?token=${TOKEN}`);

    const alert = page.getByRole('alert').filter({ hasText: /./ });
    await expect(alert).toContainText(/scaduto/i);
    await expect(page.getByRole('button', { name: /invia ordine/i })).toHaveCount(0);
  });

  test('already-consumed intent shows a clear error, and a consume race resolves to it', async ({ page }) => {
    await setupWaiter(page);
    // State-based mock (not call-count): React strict mode double-fires the
    // load effect in dev, so the intent must stay pending until the consume
    // attempt actually happens — then the reload finds it consumed.
    let raced = false;
    await page.route(`**/admin/order-intents/${TOKEN}`, (route) => {
      const status = raced ? 'consumed' : 'pending';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...PENDING_INTENT, status, consumedAt: status === 'consumed' ? Date.now() : null }),
      });
    });
    await page.route(`**/admin/order-intents/${TOKEN}/consume`, (route) => {
      raced = true; // a concurrent waiter won the race
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'consumed' }),
      });
    });

    await page.goto(`/admin/order-review/?token=${TOKEN}`);
    await page.getByRole('button', { name: /invia ordine/i }).click();

    const alert = page.getByRole('alert').filter({ hasText: /./ }).first();
    await expect(alert).toContainText(/gia stato inviato/i);
    await expect(page.getByRole('button', { name: /invia ordine/i })).toHaveCount(0);
  });
});
