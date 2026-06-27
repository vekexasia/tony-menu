import { test, expect, type Page, type Route } from '@playwright/test';
import { setupAdminTestEnv, MOCK_RESTAURANT_ID } from '../fixtures/admin-mock';

/**
 * The "menu selection" (ordering) feature is configured on the Modules page.
 * Toggling the Ordering card saves immediately via PUT /admin/modules with the
 * full modules config (no separate save button, no legacy selectionEnabled PUT).
 */
const DEFAULT_MODULES = {
  ordering: { enabled: false, mode: 'summary' as const },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
};

async function mockModulesRoutes(page: Page) {
  let current = { ...DEFAULT_MODULES };
  await page.route('**/admin/modules', async (route: Route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modules: current }) });
    }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as typeof DEFAULT_MODULES;
      current = { ...current, ...body };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, modules: current }) });
    }
    return route.continue();
  });
}

test.describe('Admin modules — ordering setting', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminTestEnv(page);
    await mockModulesRoutes(page);
  });

  test('shows the ordering module and saves enabled state', async ({ page }) => {
    await page.goto(`/admin/modules?r=${MOCK_RESTAURANT_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // The Ordering card and its enable checkbox.
    const orderingCard = page.locator('section', { has: page.getByRole('heading', { name: 'Ordering' }) });
    await expect(orderingCard).toBeVisible({ timeout: 10000 });
    const toggle = orderingCard.getByRole('checkbox');
    await expect(toggle).not.toBeChecked();

    const putRequest = page.waitForRequest(
      (req) => req.url().includes('/admin/modules') && req.method() === 'PUT',
    );

    await toggle.check();

    const request = await putRequest;
    expect((request.postDataJSON() as { ordering: { enabled: boolean } }).ordering.enabled).toBe(true);
    await expect(toggle).toBeChecked();
  });
});
