import { test, expect } from '@playwright/test';
import {
  API_URL,
  BRUSCHETTA_ID,
  addBruschettaFromMenu,
  consumeIntentApi,
  consumeStaffLinkApi,
  createIntentApi,
  createStaffLink,
  resetDemo,
  setOrdering,
  SEEDED_TABLE,
} from './fixtures/real-backend';

test.describe.serial('Waiter QR handoff — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test.beforeEach(async ({ request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'waiter' });
  });

  test('diner creates an intent and shows a QR; waiter submits it', async ({ page, context, request }) => {
    const table = SEEDED_TABLE;
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
    await waiterPage.getByLabel(/table|tavolo/i).selectOption({ label: table.name });
    await waiterPage.getByRole('button', { name: /invia ordine|submit order/i }).click();
    await expect(waiterPage.getByTestId('order-daily-number')).toHaveText('#1');
    await waiterPage.goto('/admin/orders');
    await expect(waiterPage.getByTestId('order-1')).toContainText(table.name);
  });

  test('waiter edits the intent (bump qty, add item, bind table) then submits the override', async ({ page, request }) => {
    const table = SEEDED_TABLE;
    const { token } = await createIntentApi(request); // bruschetta x2
    const staff = await createStaffLink(request);

    await page.goto(`/staff?token=${staff.token}`);
    await expect(page).toHaveURL(/\/staff\/?$/);
    await page.goto(`/order-review?token=${token}`);
    await expect(page.getByText(/bruschetta/i)).toBeVisible();

    // Bump bruschetta from 2 to 3.
    await page.getByTestId(`review-line-${BRUSCHETTA_ID}`).getByLabel(/aumenta quantità|increase/i).click();
    // Add prosecco via the flat catalog picker.
    await page.getByTestId('review-add-search').fill('prosecco');
    await page.getByTestId('review-add-demo-entry-prosecco').click();

    await page.getByLabel(/table|tavolo/i).selectOption({ label: table.name });
    const consumeReq = page.waitForRequest((req) => req.url().includes(`/order-intents/${token}/consume`) && req.method() === 'POST');
    await page.getByRole('button', { name: /invia ordine|submit order/i }).click();
    const body = (await consumeReq).postDataJSON() as { lines: { entryId: string; quantity: number }[] };
    expect(body.lines).toContainEqual({ entryId: BRUSCHETTA_ID, quantity: 3 });
    expect(body.lines).toContainEqual({ entryId: 'demo-entry-prosecco', quantity: 1 });

    await expect(page.getByTestId('order-daily-number')).toHaveText('#1');
    // Post-submit navigation: floor + table buttons.
    await expect(page.getByTestId('review-go-floor')).toBeVisible();
    await expect(page.getByTestId('review-go-table')).toBeVisible();

    await page.goto('/admin/orders');
    const card = page.getByTestId('order-1');
    await expect(card).toContainText(table.name);
    await expect(card).toContainText(/prosecco/i);
    await expect(card).toContainText('3');
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
