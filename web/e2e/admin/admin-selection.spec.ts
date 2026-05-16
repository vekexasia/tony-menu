import { test, expect } from '@playwright/test';
import { setupAdminTestEnv } from '../fixtures/admin-mock';
import { setupMockAdminSettingsRoutes } from '../fixtures/menu-selection';

const BASE = '/admin/settings/publishing/';

test.describe('Admin menu selection setting', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminTestEnv(page);
    await setupMockAdminSettingsRoutes(page, false);
    await page.route('**/firestore.googleapis.com/**', (route) => route.abort());
  });

  test('shows the menu selection setting and saves enabled state', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');

    const toggle = page.getByRole('switch', { name: /menu selection|selezione menu/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const putRequest = page.waitForRequest((req) =>
      req.url().includes('/admin/settings') && req.method() === 'PUT'
    );

    await toggle.click();
    await page.getByRole('button', { name: /save changes|salva modifiche/i }).click();

    const request = await putRequest;
    expect(request.postDataJSON()).toMatchObject({ selectionEnabled: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
