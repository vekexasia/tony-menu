import { describe, it, expect } from 'vitest';
import {
  ALLERGENS,
  ALLERGEN_NAMES,
  isAllergen,
  isMenuEntryVisibleOnMenu,
} from './types';
import type { MenuEntry } from './types';

// ── Constants ──────────────────────────────────────────────────────────────────

describe('ALLERGENS', () => {
  it('contains 14 allergens', () => {
    expect(ALLERGENS).toHaveLength(14);
  });

  it('includes Glutine', () => {
    expect(ALLERGENS).toContain('Glutine');
  });
});

describe('ALLERGEN_NAMES', () => {
  it('has a display name for every allergen', () => {
    for (const a of ALLERGENS) {
      expect(ALLERGEN_NAMES[a]).toBeTruthy();
    }
  });
});

// ── isAllergen ─────────────────────────────────────────────────────────────────

describe('isAllergen', () => {
  it('returns true for a known allergen', () => expect(isAllergen('Glutine')).toBe(true));
  it('returns false for an unknown value', () => expect(isAllergen('Peperoni')).toBe(false));
  it('returns false for null', () => expect(isAllergen(null)).toBe(false));
});

// ── isMenuEntryVisibleOnMenu ──────────────────────────────────────────────────

function makeEntry(menuIds: string[], hidden = false): MenuEntry {
  return {
    id: 'e1',
    path: 'p',
    categoryPath: 'cp',
    name: 'Test',
    price: 10,
    description: '',
    order: 0,
    minQuantity: 1,
    outOfStock: false,
    containsFrozenIngredient: false,
    allergens: [],
    menuIds,
    hidden,
    overriddenVariantPaths: [],
    overriddenExtraPaths: [],
  };
}

describe('isMenuEntryVisibleOnMenu', () => {
  it('returns true when entry is a member of the menu', () => {
    expect(isMenuEntryVisibleOnMenu(makeEntry(['m-food', 'm-lunch']), 'm-food')).toBe(true);
  });

  it('returns false when entry is not a member of the menu', () => {
    expect(isMenuEntryVisibleOnMenu(makeEntry(['m-lunch']), 'm-food')).toBe(false);
  });

  it('returns false for hidden entries even when they are members', () => {
    expect(isMenuEntryVisibleOnMenu(makeEntry(['m-food'], true), 'm-food')).toBe(false);
  });

  it('returns false for orphan (no memberships)', () => {
    expect(isMenuEntryVisibleOnMenu(makeEntry([]), 'm-food')).toBe(false);
  });
});
