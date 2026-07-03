import { test, expect, type Page } from '@playwright/test';
import { MOCK_RESTAURANT } from './fixtures/admin-mock';

/**
 * Direct order submit (issue #17): diner sends the selection from the
 * selection page when ordering is in send mode with diner submits allowed.
 * The backend /orders endpoint is mocked at the network layer.
 */

const RESTAURANT_WITH_SEND = {
  ...MOCK_RESTAURANT,
  features: {
    ...(MOCK_RESTAURANT.features ?? {}),
    aiChat: false,
    aiVoice: false,
    ordering: { enabled: true, mode: 'send' as const, submitMode: 'diner' as const },
  },
};

async function setupSendEnv(page: Page) {
  await page.addInitScript((restaurant) => {
    window.__playwright_restaurant__ = restaurant as never;
    window.localStorage.clear();
    window.localStorage.setItem('tony-menu-selection-v1', JSON.stringify({
      version: 1,
      restaurantId: 'demo-restaurant',
      updatedAt: Date.now(),
      lines: [{ entryId: 'entry-bruschetta', quantity: 2, addedAt: Date.now() }],
    }));
  }, RESTAURANT_WITH_SEND);
}

test.describe('Direct order submit', () => {
  test.beforeEach(async ({ page }) => {
    await setupSendEnv(page);
  });

  test('sends the selection and shows the daily number', async ({ page }) => {
    let submittedBody: { idempotencyKey?: string; lines?: unknown[] } | null = null;
    await page.route('**/orders', async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, orderId: 'order-1', dailyNumber: 42 }),
      });
    });

    await page.goto('/it/selection');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('Bruschetta')).toBeVisible();
    await page.getByRole('button', { name: /invia ordine/i }).click();

    await expect(page.getByText(/ordine inviato/i)).toBeVisible();
    await expect(page.getByTestId('order-daily-number')).toHaveText('#42');

    expect(submittedBody!.idempotencyKey).toEqual(expect.any(String));
    expect(submittedBody!.lines).toEqual([{ entryId: 'entry-bruschetta', quantity: 2 }]);
  });

  test('refuses stale items listing them, keeping the selection intact', async ({ page }) => {
    await page.route('**/orders', (route) => route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'stale_items', staleEntryIds: ['entry-bruschetta'] }),
    }));

    await page.goto('/it/selection');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /invia ordine/i }).click();

    // Filter out Next's empty route-announcer alert.
    const alert = page.getByRole('alert').filter({ hasText: /./ });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Bruschetta');
    // Selection stays — never silently dropped.
    await expect(page.getByRole('button', { name: /invia ordine/i })).toBeVisible();
    await expect(page.getByText('Bruschetta').first()).toBeVisible();
  });
});
