import { describe, it, expect } from 'vitest';
import { VariantSelectionSchema, ExtraOptionSchema } from '../menu.js';

describe('menu schemas', () => {
  it('VariantSelectionSchema requires name/price/isDefault', () => {
    expect(VariantSelectionSchema.safeParse({ name: 'S', price: 0, isDefault: true }).success).toBe(true);
    expect(VariantSelectionSchema.safeParse({ name: 'S', price: 0 }).success).toBe(false);
  });
  it('VariantSelectionSchema rejects non-numeric price', () => {
    expect(VariantSelectionSchema.safeParse({ name: 'S', price: 'free', isDefault: true }).success).toBe(false);
  });
  it('ExtraOptionSchema requires name and price', () => {
    expect(ExtraOptionSchema.safeParse({ name: 'Cheese', price: 100 }).success).toBe(true);
    expect(ExtraOptionSchema.safeParse({ name: 'Cheese' }).success).toBe(false);
  });
});
