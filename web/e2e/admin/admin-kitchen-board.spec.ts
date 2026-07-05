import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  API_URL,
  BRUSCHETTA_ID,
  PROSECCO_ID,
  resetDemo,
  setOrdering,
  submitLinesApi,
  submitOrderApi,
  SEEDED_CUCINA,
  SEEDED_BAR,
} from '../fixtures/real-backend';

// Rides the demo seed: bruschetta → Cucina, prosecco → Bar (entry_destinations).
async function seedOrder(request: APIRequestContext) {
  await resetDemo(request);
  await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'diner' });
  await submitOrderApi(request);
}

test.describe.serial('Kitchen board — real backend', () => {
  test.skip(!API_URL, 'Skipped: NEXT_PUBLIC_API_URL not set');

  test('is hidden (nav + page) when the ordering module is off', async ({ page, request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: false, mode: 'summary', submitMode: 'diner' });

    await page.goto('/admin/orders');

    await expect(page.getByTestId('kitchen-disabled')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('a[href*="/admin/orders"]')).toHaveCount(0);
  });

  test('shows nav link and moves an order submitted → ready → served', async ({ page, request }) => {
    await seedOrder(request);
    await page.goto('/admin/orders');

    await expect(page.locator('a[href*="/admin/orders"]').first()).toBeVisible({ timeout: 15000 });
    const card = page.getByTestId('order-1');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/bruschetta/i);
    await expect(card).toContainText(/Inviato|Submitted/);

    await card.getByRole('button', { name: /Segna pronto|Mark ready/ }).click();
    await expect(card).toContainText(/Pronto|Ready/);

    await card.getByRole('button', { name: /Segna servito|Mark served/ }).click();
    await expect(card).toContainText(/Servito|Served/);
    await expect(card.getByRole('button', { name: /Segna|Rifiuta|Mark|Reject/ })).toHaveCount(0);
  });

  test('rejects an order with a reason', async ({ page, request }) => {
    await seedOrder(request);
    await page.goto('/admin/orders');

    const card = page.getByTestId('order-1');
    await card.getByRole('button', { name: /Rifiuta|Reject/, exact: true }).click();

    const confirm = card.getByRole('button', { name: /Rifiuta ordine|Reject order/ });
    await expect(confirm).toBeDisabled();
    await card.getByPlaceholder(/Motivo del rifiuto|Reason/).fill('Mozzarella finita');
    await confirm.click();

    await expect(card).toContainText(/Rifiutato|Rejected/);
    await expect(card).toContainText('Mozzarella finita');
  });

  test('each department marks its own row done independently', async ({ page, request }) => {
    await resetDemo(request);
    await setOrdering(request, { enabled: true, mode: 'send', submitMode: 'diner' });
    // One order spanning both seeded departments: bruschetta → Cucina, prosecco → Bar.
    await submitLinesApi(request, [{ entryId: BRUSCHETTA_ID, quantity: 2 }, { entryId: PROSECCO_ID, quantity: 1 }]);
    await page.goto('/admin/orders');

    await page.getByRole('button', { name: SEEDED_CUCINA.name, exact: true }).click();
    const cucinaOrder = page.getByTestId('dept-order-1');
    await expect(cucinaOrder).toContainText(/bruschetta/i);
    await cucinaOrder.getByRole('checkbox').check();
    await expect(cucinaOrder.getByRole('checkbox')).toBeChecked();

    await page.getByRole('button', { name: SEEDED_BAR.name, exact: true }).click();
    const barOrder = page.getByTestId('dept-order-1');
    await expect(barOrder).toContainText(/prosecco/i);
    await expect(barOrder.getByRole('checkbox')).not.toBeChecked();
  });
});
