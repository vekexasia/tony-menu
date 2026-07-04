import { test, expect, type Page } from '@playwright/test';
import { setupDemoMenuSelection } from './fixtures/menu-selection';

const ITEM = 'Bruschetta al pomodoro';

async function dismissPopups(page: Page) {
  for (const name of ['NON ORA', 'OK']) {
    await page.getByRole('button', { name }).click({ timeout: 2000 }).catch(() => {});
  }
}

async function addBruschetta(page: Page) {
  await page.goto('/it/menu');
  await page.waitForLoadState('domcontentloaded');
  await dismissPopups(page);
  await page.getByText(ITEM).first().click();
  await page.getByRole('button', { name: /aggiungi alla selezione/i }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('Menu selection diner flow', () => {
  test('adds an item, opens the selection page, changes quantity, and clears it', async ({ page, request }) => {
    await setupDemoMenuSelection(request, true);
    await addBruschetta(page);
    await page.keyboard.press('Escape');

    const headerLink = page.getByRole('link', { name: /la mia selezione \(1\)/i });
    await expect(headerLink).toBeVisible({ timeout: 10000 });
    await headerLink.click({ force: true });

    await expect(page).toHaveURL(/\/it\/selection/);
    await expect(page.getByRole('heading', { name: /la mia selezione/i })).toBeVisible();
    await expect(page.getByText('Antipasti')).toBeVisible();
    await expect(page.getByText(ITEM)).toBeVisible();
    await expect(page.locator('main')).not.toContainText('€');

    await page.getByRole('button', { name: new RegExp(`aumenta quantita di ${ITEM}`, 'i') }).click();
    await expect(page.locator('main')).toContainText('2');

    await page.getByRole('button', { name: new RegExp(`diminuisci quantita di ${ITEM}`, 'i') }).click();
    await page.getByRole('button', { name: new RegExp(`diminuisci quantita di ${ITEM}`, 'i') }).click();
    await expect(page.getByText(ITEM)).not.toBeVisible();
    await expect(page.getByText(/la tua selezione e vuota/i)).toBeVisible();
  });
});

test.describe('Menu selection disabled', () => {
  test('does not show add controls or header link when disabled', async ({ page, request }) => {
    await setupDemoMenuSelection(request, false);
    await page.goto('/it/menu');
    await page.waitForLoadState('domcontentloaded');
    await dismissPopups(page);

    await page.getByText(ITEM).first().click();
    await expect(page.getByRole('button', { name: /aggiungi alla selezione/i })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /la mia selezione/i })).not.toBeVisible();
  });

  test('does not show stored selections on direct selection page when disabled', async ({ page, request }) => {
    await setupDemoMenuSelection(request, true);
    await addBruschetta(page);

    await setupDemoMenuSelection(request, false);
    await page.goto('/it/selection');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText(/selezione non disponibile/i)).toBeVisible();
    await expect(page.getByText(ITEM)).not.toBeVisible();
  });
});
