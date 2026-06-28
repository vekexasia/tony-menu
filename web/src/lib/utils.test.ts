import { describe, it, expect } from 'vitest';
import { cn, formatPrice } from './utils';

describe('cn', () => {
  describe('merging multiple classes', () => {
    it('should merge multiple class strings', () => {
      expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
    });

    it('should merge multiple classes in a single string', () => {
      expect(cn('px-4 py-2', 'text-red-500')).toBe('px-4 py-2 text-red-500');
    });
  });

  describe('handling conditional classes', () => {
    it('should include class when condition is true', () => {
      const isPrimary = true;
      expect(cn('px-4', isPrimary && 'bg-primary')).toBe('px-4 bg-primary');
    });

    it('should exclude class when condition is false', () => {
      const isPrimary = false;
      expect(cn('px-4', isPrimary && 'bg-primary')).toBe('px-4');
    });

    it('should handle undefined and null values', () => {
      expect(cn('px-4', undefined, null, 'py-2')).toBe('px-4 py-2');
    });

    it('should handle object syntax for conditional classes', () => {
      expect(cn('px-4', { 'bg-primary': true, 'text-white': false })).toBe('px-4 bg-primary');
    });
  });

  describe('handling conflicting Tailwind classes', () => {
    it('should resolve conflicting padding classes (last wins)', () => {
      expect(cn('px-4', 'px-2')).toBe('px-2');
    });

    it('should resolve conflicting margin classes', () => {
      expect(cn('mt-4', 'mt-8')).toBe('mt-8');
    });

    it('should resolve conflicting background colors', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('should resolve conflicting text sizes', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    });

    it('should not merge non-conflicting classes', () => {
      expect(cn('px-4', 'py-2', 'bg-primary')).toBe('px-4 py-2 bg-primary');
    });
  });
});

describe('formatPrice', () => {
  it('formats whole numbers', () => {
    expect(formatPrice(10)).toBe('€ 10,00');
  });

  it('formats decimals with a comma separator', () => {
    expect(formatPrice(12.5)).toBe('€ 12,50');
    expect(formatPrice(9.99)).toBe('€ 9,99');
  });

  it('rounds to two decimal places', () => {
    expect(formatPrice(10.999)).toBe('€ 11,00');
  });

  it('appends a unit when provided', () => {
    expect(formatPrice(12.5, 'kg')).toBe('€ 12,50/kg');
  });

  it('omits the unit when null or undefined', () => {
    expect(formatPrice(8, null)).toBe('€ 8,00');
    expect(formatPrice(8)).toBe('€ 8,00');
  });
});
