import { test, expect, type Page, type Route } from '@playwright/test';
import { MOCK_RESTAURANT, MOCK_USER, MOCK_RESTAURANT_ID } from '../fixtures/admin-mock';

/**
 * Kitchen board (#18): visibility gating on the ordering module, whole-order
 * status transitions, reject-with-reason, and per-department mark-done.
 * Backend routes are mocked; the real API logic is covered by backend unit tests.
 */

const ORDER = {
  id: 'order-1',
  dailyNumber: 1,
  status: 'submitted' as string,
  rejectReason: null as string | null,
  createdAt: Date.now(),
  items: [
    {
      id: 'item-1',
      name: 'Pizza e patatine',
      price: 1200,
      quantity: 2,
      destinations: [
        { id: 'oid-pizza', destinationId: 'dest-pizza', destinationName: 'Pizza', printedAt: null as number | null },
        { id: 'oid-fries', destinationId: 'dest-fries', destinationName: 'Friggitoria', printedAt: null as number | null },
      ],
    },
  ],
};

const DESTINATIONS = [
  { id: 'dest-pizza', name: 'Pizza', sortOrder: 0 },
  { id: 'dest-fries', name: 'Friggitoria', sortOrder: 1 },
];

async function setupBoardEnv(page: Page, { orderingEnabled = true } = {}) {
  // Single init script with the ordering feature already baked in — no
  // dependence on a second script mutating the fixture object afterwards.
  const restaurant = {
    ...MOCK_RESTAURANT,
    features: {
      ...MOCK_RESTAURANT.features,
      ordering: { enabled: orderingEnabled, mode: 'send' as const, submitMode: 'diner' as const },
    },
  };
  await page.addInitScript(
    ({ restaurant, user, rid }) => {
      window.__playwright_admin__ = { user, restaurantId: rid };
      window.__playwright_restaurant__ = restaurant as never;
    },
    { restaurant, user: MOCK_USER, rid: MOCK_RESTAURANT_ID },
  );

  const orders = [structuredClone(ORDER)];
  await page.route('**/admin/orders**', async (route: Route) => {
    // The pattern also matches the /admin/orders page navigation itself —
    // only intercept API (fetch) calls, let the document load normally.
    if (route.request().resourceType() === 'document') return route.continue();
    const url = route.request().url();
    const method = route.request().method();
    const statusMatch = url.match(/\/admin\/orders\/([^/]+)\/status/);
    if (statusMatch && method === 'PATCH') {
      const body = route.request().postDataJSON() as { status: string; rejectReason?: string };
      const order = orders.find((o) => o.id === statusMatch[1])!;
      order.status = body.status;
      order.rejectReason = body.rejectReason ?? null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: body.status }) });
    }
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: 20260703, orders }) });
    }
    return route.continue();
  });

  const printed = new Map<string, number | null>();
  await page.route('**/admin/order-item-destinations/*/printed', async (route: Route) => {
    const id = route.request().url().match(/order-item-destinations\/([^/]+)\/printed/)![1];
    const body = route.request().postDataJSON() as { printed: boolean };
    const printedAt = body.printed ? Date.now() : null;
    printed.set(id, printedAt);
    for (const item of orders[0].items) {
      for (const dest of item.destinations) {
        if (dest.id === id) dest.printedAt = printedAt;
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, printedAt }) });
  });

  await page.route('**/admin/order-destinations', async (route: Route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ destinations: DESTINATIONS }) });
  });

  return { orders, printed };
}

test.describe('Kitchen board', () => {
  test('is hidden (nav + page) when the ordering module is off', async ({ page }) => {
    await setupBoardEnv(page, { orderingEnabled: false });
    await page.goto(`/admin/orders?r=${MOCK_RESTAURANT_ID}`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('kitchen-disabled')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('header').getByRole('link', { name: 'Ordini' })).toHaveCount(0);
  });

  test('shows nav link and moves an order submitted → ready → served', async ({ page }) => {
    await setupBoardEnv(page);
    await page.goto(`/admin/orders?r=${MOCK_RESTAURANT_ID}`);

    await expect(page.locator('header').getByRole('link', { name: 'Ordini' })).toBeVisible({ timeout: 10000 });
    const card = page.getByTestId('order-1');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Pizza e patatine');
    await expect(card).toContainText('Inviato');

    await card.getByRole('button', { name: 'Segna pronto' }).click();
    await expect(card).toContainText('Pronto');

    await card.getByRole('button', { name: 'Segna servito' }).click();
    await expect(card).toContainText('Servito');
    // Terminal state: no further transition buttons.
    await expect(card.getByRole('button', { name: /Segna|Rifiuta/ })).toHaveCount(0);
  });

  test('rejects an order with a reason', async ({ page }) => {
    await setupBoardEnv(page);
    await page.goto(`/admin/orders?r=${MOCK_RESTAURANT_ID}`);

    const card = page.getByTestId('order-1');
    await card.getByRole('button', { name: 'Rifiuta', exact: true }).click();

    const confirm = card.getByRole('button', { name: 'Rifiuta ordine' });
    await expect(confirm).toBeDisabled();
    await card.getByPlaceholder('Motivo del rifiuto').fill('Mozzarella finita');
    await confirm.click();

    await expect(card).toContainText('Rifiutato');
    await expect(card).toContainText('Mozzarella finita');
  });

  test('each department marks its own row done independently', async ({ page }) => {
    const { printed } = await setupBoardEnv(page);
    await page.goto(`/admin/orders?r=${MOCK_RESTAURANT_ID}`);

    // Pizza department: mark its row done.
    await page.getByRole('button', { name: 'Pizza', exact: true }).click();
    const pizzaOrder = page.getByTestId('dept-order-1');
    await expect(pizzaOrder).toContainText('Pizza e patatine');
    await pizzaOrder.getByRole('checkbox').check();
    await expect(pizzaOrder.getByRole('checkbox')).toBeChecked();

    // Friggitoria still sees its own row unchecked — independence.
    await page.getByRole('button', { name: 'Friggitoria' }).click();
    const friesOrder = page.getByTestId('dept-order-1');
    await expect(friesOrder).toContainText('Pizza e patatine');
    await expect(friesOrder.getByRole('checkbox')).not.toBeChecked();

    expect(printed.get('oid-pizza')).not.toBeNull();
    expect(printed.has('oid-fries')).toBe(false);
  });
});
