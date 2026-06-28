import { describe, expect, it } from 'vitest';
import { searchByAllergens, getItemDetail } from './serialize';
import type { MenuDataCache } from '../types';

function cache(): MenuDataCache {
  return {
    restaurant: { name: 'Demo' },
    categories: [
      {
        id: 'cat-1',
        name: 'Primi',
        order: 0,
        variantPaths: ['variants/v-size'],
        extraPaths: ['extras/e-cheese'],
        entries: [
          {
            id: 'gluten-pasta',
            categoryId: 'cat-1',
            name: 'Tagliatelle',
            description: 'Egg pasta',
            price: 1200,
            outOfStock: false,
            containsFrozenIngredient: false,
            allergens: ['Glutine', 'Uova'],
            menuVisibility: ['m-1'],
            labelIds: [],
          },
          {
            id: 'safe-salad',
            categoryId: 'cat-1',
            name: 'Insalata',
            description: 'Green salad',
            price: 800,
            outOfStock: false,
            containsFrozenIngredient: false,
            allergens: [],
            menuVisibility: ['m-1'],
            labelIds: [],
          },
          {
            id: 'oos-fish',
            categoryId: 'cat-1',
            name: 'Branzino',
            description: 'Sea bass',
            price: 2000,
            outOfStock: true,
            containsFrozenIngredient: false,
            allergens: ['Pesce'],
            menuVisibility: ['m-1'],
            labelIds: [],
          },
        ],
      },
    ],
    variants: [
      {
        id: 'v-size',
        path: 'variants/v-size',
        name: 'Size',
        selections: [
          { name: 'Small', price: 0, isDefault: true },
          { name: 'Large', price: 300, isDefault: false, i18n: { de: { name: 'Gross' } } },
        ],
      },
    ],
    extras: [
      {
        id: 'e-cheese',
        path: 'extras/e-cheese',
        name: 'Cheese',
        max: 1,
        type: 'single',
        extras: [{ name: 'Parmesan', price: 100 }],
      },
    ],
    labels: [],
  };
}

describe('searchByAllergens (allergen exclusion)', () => {
  it('excludes items that contain an excluded allergen and keeps safe ones', () => {
    const results = searchByAllergens(cache(), ['Glutine'], 'en');
    const ids = results.map(r => r.id);
    expect(ids).toContain('safe-salad');
    expect(ids).not.toContain('gluten-pasta');
  });

  it('excludes out-of-stock items entirely', () => {
    const results = searchByAllergens(cache(), ['Glutine'], 'en');
    expect(results.map(r => r.id)).not.toContain('oos-fish');
  });

  it('maps allergen ids to readable names for surviving items', () => {
    // exclude nothing meaningful so the egg+gluten pasta survives and we can check mapping
    const results = searchByAllergens(cache(), ['Soia'], 'en');
    const pasta = results.find(r => r.id === 'gluten-pasta');
    expect(pasta?.allergens).toEqual(['Gluten', 'Eggs']);
  });

  it('represents an item with no allergens as the string "none", not a safety guarantee', () => {
    const results = searchByAllergens(cache(), ['Glutine'], 'en');
    const salad = results.find(r => r.id === 'safe-salad');
    // pin serialize.ts:179 behaviour: empty allergens -> "none"
    expect(salad?.allergens).toBe('none');
    // it is a bare data marker, never a worded safety claim
    expect(salad?.allergens).not.toMatch(/safe|guarantee|allergen-free|suitable/i);
  });
});

describe('getItemDetail allergen/variant/extra mapping', () => {
  it('maps allergen ids through ALLERGEN_NAMES', () => {
    const detail = getItemDetail(cache(), 'gluten-pasta', 'en');
    expect(detail?.allergens).toEqual(['Gluten', 'Eggs']);
  });

  it('omits allergens when the item has none', () => {
    const detail = getItemDetail(cache(), 'safe-salad', 'en');
    expect(detail).not.toHaveProperty('allergens');
  });

  it('includes category-level variants with localized option names and default flag', () => {
    const detail = getItemDetail(cache(), 'gluten-pasta', 'de');
    const variants = detail?.variants as { name: string; options: { name: string; default?: boolean }[] }[];
    expect(variants).toHaveLength(1);
    expect(variants[0].options).toEqual([
      { name: 'Small', default: true },
      { name: 'Gross' },
    ]);
  });

  it('includes category-level extras with their options', () => {
    const detail = getItemDetail(cache(), 'gluten-pasta', 'en');
    const extras = detail?.extras as { name: string; options: { name: string }[] }[];
    expect(extras).toEqual([{ name: 'Cheese', options: [{ name: 'Parmesan' }] }]);
  });

  it('flags out-of-stock items', () => {
    const detail = getItemDetail(cache(), 'oos-fish', 'en');
    expect(detail?.outOfStock).toBe(true);
  });
});
