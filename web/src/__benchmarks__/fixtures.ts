/**
 * Deterministic fixtures for the web benchmarks.
 *
 * Sizes mirror a real mid-size restaurant menu (12 categories, 300 dishes,
 * 3 translated locales) so the numbers CodSpeed tracks reflect what a diner's
 * phone actually has to chew through.
 */

import type { I18nMap, MenuCategory, MenuEntry } from '@/lib/types';

const LOCALES = ['en', 'de', 'fr'] as const;

function i18nFor(name: string, description: string): I18nMap {
  const map: I18nMap = {};
  for (const locale of LOCALES) {
    map[locale] = {
      name: `${name} (${locale})`,
      description: `${description} (${locale})`,
    };
  }
  return map;
}

export function makeMenuEntries(count = 300): MenuEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const name = `Dish ${i}`;
    const description = `A generously described plate number ${i} served with seasonal vegetables`;
    return {
      id: `entry-${i}`,
      path: `menu_entries/entry-${i}`,
      categoryPath: `menu_categories/cat-${i % 12}`,
      name,
      description,
      price: 5 + (i % 40) * 1.25,
      priceUnit: i % 7 === 0 ? 'kg' : undefined,
      image: i % 3 === 0 ? `https://cdn.example.com/img/${i}.webp` : undefined,
      order: i,
      outOfStock: i % 11 === 0,
      containsFrozenIngredient: i % 13 === 0,
      menuIds: [`menu-${i % 3}`],
      hidden: i % 17 === 0,
      allergens: [],
      labelIds: [`label-${i % 8}`],
      i18n: i18nFor(name, description),
    } satisfies MenuEntry;
  });
}

export function makeMenuCategories(categoryCount = 12, entriesPerCategory = 25): MenuCategory[] {
  const entries = makeMenuEntries(categoryCount * entriesPerCategory);
  return Array.from({ length: categoryCount }, (_, c) => ({
    id: `cat-${c}`,
    path: `menu_categories/cat-${c}`,
    name: `Category ${c}`,
    order: c,
    entries: entries.slice(c * entriesPerCategory, (c + 1) * entriesPerCategory),
    variantPaths: [],
    extraPaths: [],
    i18n: i18nFor(`Category ${c}`, `Category ${c} description`),
  } satisfies MenuCategory));
}
