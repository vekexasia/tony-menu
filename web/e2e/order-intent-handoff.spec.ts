import { test, expect } from '@playwright/test';
import {
  API_URL,
  BRUSCHETTA_ID,
  addBruschettaFromMenu,
  consumeIntentApi,
  consumeStaffLinkApi,
  createIntentApi,
  createStaffLink,
  createTable,
  resetDemo,
  setOrdering,
} from './fixtures/real-backend';

test.describe.serial('Waiter QR handoff — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'waiter' });
    await createTable(request);
  });

  test('diner creates an intent and shows a QR; waiter submits it', async ({ page, context, request }) => {
    await addBruschettaFromMenu(page);
    await page.getByRole('link', { name: /la mia selezione/i }).click();

    const intentReq = page.waitForRequest((req) => req.url().includes('/orders/intents') && req.method() === 'POST');
    const intentRes = page.waitForResponse((res) => res.url().includes('/orders/intents') && res.request().method() === 'POST');
    await page.getByRole('button', { name: /mostra qr al cameriere/i }).click();

    await expect(page.getByTestId('waiter-qr')).toBeVisible();
    expect((await intentReq).postDataJSON()).toMatchObject({ lines: [{ entryId: BRUSCHETTA_ID, quantity: 1 }] });
    const intentResponse = await intentRes;
    expect(intentResponse.ok()).toBeTruthy();
    const { token } = await intentResponse.json() as { token: string };

    const staff = await createStaffLink(request);
    const waiterPage = await context.newPage();
    await waiterPage.goto(`/staff?token=${staff.token}`);
    await expect(waiterPage).toHaveURL(/\/staff\/?$/);

    await waiterPage.goto(`/order-review?token=${token}`);
    await expect(waiterPage.getByText(/bruschetta/i)).toBeVisible();
    await waiterPage.getByRole('button', { name: /invia ordine|submit order/i }).click();
    await expect(waiterPage.getByTestId('order-daily-number')).toHaveText('#1');
  });

  test('already-consumed intent shows a clear error and no submit button', async ({ page, request }) => {
    const staff = await createStaffLink(request);
    const { sessionToken } = await consumeStaffLinkApi(request, staff.token);
    const { token } = await createIntentApi(request);
    await consumeIntentApi(request, token, sessionToken);

    const secondStaff = await createStaffLink(request);
    await page.goto(`/staff?token=${secondStaff.token}`);
    await expect(page).toHaveURL(/\/staff\/?$/);

    await page.goto(`/order-review?token=${token}`);
    const alert = page.getByRole('alert').filter({ hasText: /./ }).first();
    await expect(alert).toContainText(/gia stato inviato|already submitted|already been submitted/i);
    await expect(page.getByRole('button', { name: /invia ordine|submit order/i })).toHaveCount(0);
  });
});
