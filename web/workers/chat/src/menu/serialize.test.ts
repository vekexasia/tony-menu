import { describe, expect, it } from 'vitest';
import { getItemDetail } from './serialize';
import type { MenuDataCache } from '../types';

// Locks in the getLocalized merge: a single helper must still fall back to
// entry.description for the description field (the old getLocalizedEntry behaviour),
// while name uses the base name, and i18n overrides win when present.
function cache(): MenuDataCache {
  return {
    restaurant: { name: 'Demo' },
    categories: [
      {
        id: 'cat-1',
        name: 'Pasta',
        order: 0,
        entries: [
          {
            id: 'e-1',
            categoryId: 'cat-1',
            name: 'Ravioli',
            description: 'Homemade ravioli',
            price: 1450,
            outOfStock: false,
            containsFrozenIngredient: false,
            allergens: [],
            menuVisibility: ['m-1'],
            labelIds: [],
            i18n: { de: { name: 'Ravioli DE', description: 'Hausgemacht' } },
          },
        ],
      },
    ],
    labels: [],
  };
}

describe('getItemDetail localized fields', () => {
  it('falls back to base name and description when locale has no translation', () => {
    const detail = getItemDetail(cache(), 'e-1', 'en');
    expect(detail?.name).toBe('Ravioli');
    expect(detail?.description).toBe('Homemade ravioli');
  });

  it('uses i18n translations for both name and description when present', () => {
    const detail = getItemDetail(cache(), 'e-1', 'de');
    expect(detail?.name).toBe('Ravioli DE');
    expect(detail?.description).toBe('Hausgemacht');
  });

  it('omits description when the entry has none', () => {
    const data = cache();
    delete data.categories[0].entries[0].description;
    const detail = getItemDetail(data, 'e-1', 'en');
    expect(detail).not.toHaveProperty('description');
  });
});
