import { test, expect } from '@playwright/test';

const restaurant = {
  id: 'admin-items-all',
  name: 'Ristorante Items E2E',
  menus: [{ id: 'menu-food', code: 'food', title: 'Food', published: true, sortOrder: 0 }],
  categories: [
    {
      id: 'cat-starters',
      path: 'menuEntries/cat-starters',
      name: 'Antipasti',
      order: 0,
      variantPaths: [],
      extraPaths: [],
      entries: [
        {
          id: 'entry-bruschetta',
          path: 'menuEntries/cat-starters/entries/entry-bruschetta',
          categoryPath: 'menuEntries/cat-starters',
          name: 'Bruschetta',
          description: 'Pane tostato',
          price: 7.5,
          order: 0,
          outOfStock: false,
          containsFrozenIngredient: false,
          allergens: [],
          menuIds: ['menu-food'],
          labelIds: [],
          hidden: false,
        },
        {
          id: 'entry-soup',
          path: 'menuEntries/cat-starters/entries/entry-soup',
          categoryPath: 'menuEntries/cat-starters',
          name: 'Soup',
          description: 'Bruschetta-inspired tomato bowl',
          price: 8,
          order: 1,
          outOfStock: false,
          containsFrozenIngredient: false,
          allergens: [],
          menuIds: ['menu-food'],
          labelIds: [],
          hidden: false,
        },
      ],
    },
    {
      id: 'cat-desserts',
      path: 'menuEntries/cat-desserts',
      name: 'Dolci',
      order: 1,
      variantPaths: [],
      extraPaths: [],
      entries: [
        {
          id: 'entry-tiramisu',
          path: 'menuEntries/cat-desserts/entries/entry-tiramisu',
          categoryPath: 'menuEntries/cat-desserts',
          name: 'Tiramisu',
          description: 'Dolce al caffè',
          price: 6,
          order: 0,
          outOfStock: false,
          containsFrozenIngredient: false,
          allergens: [],
          menuIds: ['menu-food'],
          labelIds: [],
          hidden: false,
        },
      ],
    },
  ],
  features: { primaryLocale: 'it' },
};

test.describe('Admin items page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((mockRestaurant) => {
      const testWindow = window as Window & {
        __playwright_admin__?: unknown;
        __playwright_restaurant__?: unknown;
      };
      testWindow.__playwright_admin__ = {
        user: { uid: 'admin-user', email: 'admin@example.com', name: 'Admin User' },
      };
      testWindow.__playwright_restaurant__ = mockRestaurant;
    }, restaurant);
  });

  test('sidebar Items opens all items and filters by item name', async ({ page }) => {
    await page.goto('/admin/categories/');

    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });
    await page.getByRole('link', { name: /Items|Piatti/ }).click();

    await expect(page).toHaveURL(/\/admin\/items/);
    await expect(page.locator('h2')).toContainText(/ALL ITEMS|TUTTI GLI ARTICOLI/);
    await expect(page.getByRole('heading', { name: 'Bruschetta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Soup' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tiramisu' })).toBeVisible();

    await page.getByPlaceholder(/Search items|Cerca articoli/).fill('brus');

    await expect(page.getByRole('heading', { name: 'Bruschetta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Soup' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tiramisu' })).not.toBeVisible();
  });
});
