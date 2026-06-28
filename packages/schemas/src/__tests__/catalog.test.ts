import { describe, it, expect } from 'vitest';
import {
  LabelColorSchema,
  MenuIconSchema,
  HHMMSchema,
  WeekdaySchema,
  CatalogEntrySchema,
  CatalogMenuSchema,
  CatalogResponseSchema,
} from '../catalog.js';

const entry = {
  id: 'e1', name: 'Pizza', description: null, price: 950, priceUnit: null,
  imageUrl: null, outOfStock: false, frozen: false, sortOrder: 0, hidden: false,
  menuIds: [], labelIds: [], allergens: null, i18n: null, metadata: null,
};

describe('catalog schemas', () => {
  it('LabelColorSchema validates the enum', () => {
    expect(LabelColorSchema.safeParse('green').success).toBe(true);
    expect(LabelColorSchema.safeParse('chartreuse').success).toBe(false);
  });
  it('MenuIconSchema validates known icons', () => {
    expect(MenuIconSchema.safeParse('wine').success).toBe(true);
    expect(MenuIconSchema.safeParse('spaceship').success).toBe(false);
  });
  it('HHMMSchema enforces HH:MM', () => {
    expect(HHMMSchema.safeParse('09:30').success).toBe(true);
    expect(HHMMSchema.safeParse('9:30').success).toBe(false);
  });
  it('WeekdaySchema validates abbreviations', () => {
    expect(WeekdaySchema.safeParse('mon').success).toBe(true);
    expect(WeekdaySchema.safeParse('monday').success).toBe(false);
  });
  it('CatalogEntrySchema requires core fields and numeric price', () => {
    expect(CatalogEntrySchema.safeParse(entry).success).toBe(true);
    expect(CatalogEntrySchema.safeParse({ ...entry, price: 'free' }).success).toBe(false);
  });
  it('CatalogMenuSchema requires id/code/title', () => {
    const menu = { id: 'm1', code: 'food', title: 'Food', i18n: null, published: true, sortOrder: 0, icon: 'utensils' };
    expect(CatalogMenuSchema.safeParse(menu).success).toBe(true);
    expect(CatalogMenuSchema.safeParse({ ...menu, published: 'yes' }).success).toBe(false);
  });
  it('CatalogResponseSchema requires all collections', () => {
    const resp = {
      restaurant: { id: 'r1', slug: 's', name: 'R', payoff: null, theme: null, info: null, socials: null, openingSchedule: null },
      menus: [], categories: [], variants: [], extras: [], labels: [], generatedAt: '2026-01-01T00:00:00Z',
    };
    expect(CatalogResponseSchema.safeParse(resp).success).toBe(true);
    expect(CatalogResponseSchema.safeParse({ ...resp, menus: undefined }).success).toBe(false);
  });
});
