import { test, expect } from '@playwright/test';
import { setupPublicMenuSelectionEnv } from './fixtures/menu-selection';

test.describe('Menu selection diner flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupPublicMenuSelectionEnv(page, true);
  });

  test('adds an item, opens the selection page, changes quantity, and clears it', async ({ page }) => {
    await page.goto('/it/menu');
    await page.waitForLoadState('domcontentloaded');

    const noticeOkButton = page.locator('.fixed.inset-0 button', { hasText: 'OK' });
    try {
      await noticeOkButton.waitFor({ state: 'visible', timeout: 5000 });
      await noticeOkButton.click();
      await expect(noticeOkButton).not.toBeVisible({ timeout: 5000 });
    } catch {
      // The notice is optional for restaurants that disable it.
    }

    await page.getByText('Bruschetta').first().click();
    await page.getByRole('button', { name: /aggiungi alla selezione/i }).click();
    await page.keyboard.press('Escape');

    const headerLink = page.getByRole('link', { name: /la mia selezione \(1\)/i });
    await expect(headerLink).toBeVisible({ timeout: 10000 });
    await headerLink.click({ force: true });

    await expect(page).toHaveURL(/\/it\/selection/);
    await expect(page.getByRole('heading', { name: /la mia selezione/i })).toBeVisible();
    await expect(page.getByText('Antipasti')).toBeVisible();
    await expect(page.getByText('Bruschetta')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('€');

    await page.getByRole('button', { name: /aumenta quantita di bruschetta/i }).click();
    await expect(page.locator('main')).toContainText('2');

    await page.getByRole('button', { name: /diminuisci quantita di bruschetta/i }).click();
    await page.getByRole('button', { name: /diminuisci quantita di bruschetta/i }).click();
    await expect(page.getByText('Bruschetta')).not.toBeVisible();
    await expect(page.getByText(/la tua selezione e vuota/i)).toBeVisible();
  });
});

test.describe('Menu selection disabled', () => {
  test.beforeEach(async ({ page }) => {
    await setupPublicMenuSelectionEnv(page, false);
  });

  test('does not show add controls or header link when disabled', async ({ page }) => {
    await page.goto('/it/menu');
    await page.waitForLoadState('domcontentloaded');

    const noticeOkButton = page.locator('.fixed.inset-0 button', { hasText: 'OK' });
    try {
      await noticeOkButton.waitFor({ state: 'visible', timeout: 5000 });
      await noticeOkButton.click();
      await expect(noticeOkButton).not.toBeVisible({ timeout: 5000 });
    } catch {
      // The notice is optional for restaurants that disable it.
    }

    await page.getByText('Bruschetta').first().click();
    await expect(page.getByRole('button', { name: /aggiungi alla selezione/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /la mia selezione/i })).not.toBeVisible();
  });

  test('does not show stored selections on direct selection page when disabled', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('tony-menu-selection-v1', JSON.stringify({
        version: 1,
        restaurantId: 'demo-restaurant',
        updatedAt: Date.now(),
        lines: [{ entryId: 'entry-bruschetta', quantity: 1, addedAt: Date.now() }],
      }));
    });

    await page.goto('/it/selection');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText(/selezione non disponibile/i)).toBeVisible();
    await expect(page.getByText('Bruschetta')).not.toBeVisible();
  });
});
