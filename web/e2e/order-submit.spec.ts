import { test, expect } from '@playwright/test';
import { API_URL, BRUSCHETTA_ID, addBruschettaFromMenu, resetDemo, setE2eIp, setOrdering, updateEntry } from './fixtures/real-backend';

test.describe.serial('Direct order submit — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'diner' });
  });

  test('sends the selection and shows the daily number', async ({ page }) => {
    await addBruschettaFromMenu(page);

    const orderReq = page.waitForRequest((req) => req.url().includes('/orders') && req.method() === 'POST');
    const orderRes = page.waitForResponse((res) => res.url().includes('/orders') && res.request().method() === 'POST');

    await page.getByRole('link', { name: /la mia selezione/i }).click();
    await expect(page.getByText(/bruschetta/i).first()).toBeVisible();
    await page.getByRole('button', { name: /invia ordine/i }).click();

    const body = (await orderReq).postDataJSON() as { idempotencyKey?: string; lines?: unknown[] };
    expect(body.idempotencyKey).toEqual(expect.any(String));
    expect(body.lines).toEqual([{ entryId: BRUSCHETTA_ID, quantity: 1 }]);
    const response = await orderRes;
    expect(await response.text()).toMatch(/\"ok\":true/);
    expect(response.ok()).toBeTruthy();

    await expect(page.getByText(/ordine inviato/i)).toBeVisible();
    await expect(page.getByTestId('order-daily-number')).toHaveText('#1');
  });

  test('refuses stale items listing them, keeping the selection intact', async ({ page, request }) => {
    await addBruschettaFromMenu(page);
    await page.getByRole('link', { name: /la mia selezione/i }).click();
    await expect(page.getByRole('button', { name: /invia ordine/i })).toBeEnabled();

    await updateEntry(request, BRUSCHETTA_ID, { outOfStock: true });
    await page.getByRole('button', { name: /invia ordine/i }).click();

    const alert = page.getByRole('alert').filter({ hasText: /bruschetta/i }).first();
    await expect(alert).toContainText(/bruschetta/i);
    await expect(page.getByRole('button', { name: /invia ordine/i })).toBeVisible();
    await expect(page.getByText(/bruschetta/i).first()).toBeVisible();
  });
});
