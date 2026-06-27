import { describe, it, expect } from 'vitest';
import { cn, formatPrice, hexToHSL, generateColorVariables } from './utils';

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
  describe('formatting prices with currency symbol', () => {
    it('should format whole numbers with currency', () => {
      expect(formatPrice(10)).toBe('10,00 €');
    });

    it('should format decimal prices with currency', () => {
      expect(formatPrice(12.5)).toBe('12,50 €');
    });

    it('should format prices with two decimal places', () => {
      expect(formatPrice(9.99)).toBe('9,99 €');
    });

    it('should use comma as decimal separator (Italian format)', () => {
      expect(formatPrice(15.75)).toContain(',');
      expect(formatPrice(15.75)).not.toContain('.');
    });
  });

  describe('formatting prices without currency symbol', () => {
    it('should format price without currency when showCurrency is false', () => {
      expect(formatPrice(10, false)).toBe('10,00');
    });

    it('should not include euro symbol when showCurrency is false', () => {
      expect(formatPrice(12.5, false)).not.toContain('€');
    });
  });

  describe('handling decimal values', () => {
    it('should round to two decimal places', () => {
      expect(formatPrice(10.999)).toBe('11,00 €');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('0,00 €');
    });

    it('should handle small decimal values', () => {
      expect(formatPrice(0.5)).toBe('0,50 €');
    });

    it('should handle large numbers', () => {
      expect(formatPrice(1000)).toBe('1000,00 €');
    });
  });
});

describe('hexToHSL', () => {
  describe('converting hex colors to HSL', () => {
    it('should convert pure red (#ff0000)', () => {
      const result = hexToHSL('#ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('should convert pure green (#00ff00)', () => {
      const result = hexToHSL('#00ff00');
      expect(result.h).toBe(120);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('should convert pure blue (#0000ff)', () => {
      const result = hexToHSL('#0000ff');
      expect(result.h).toBe(240);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('should convert white (#ffffff)', () => {
      const result = hexToHSL('#ffffff');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(100);
    });

    it('should convert black (#000000)', () => {
      const result = hexToHSL('#000000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(0);
    });

    it('should convert gray (#808080)', () => {
      const result = hexToHSL('#808080');
      expect(result.h).toBe(0);
      expect(result.s).toBe(0);
      expect(result.l).toBe(50);
    });

    it('should convert the project primary color (#cc9166)', () => {
      const result = hexToHSL('#cc9166');
      expect(result.h).toBe(25);
      expect(result.s).toBe(50);
      expect(result.l).toBe(60);
    });
  });

  describe('handling with/without # prefix', () => {
    it('should handle hex without # prefix', () => {
      const result = hexToHSL('ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('should handle hex with # prefix', () => {
      const result = hexToHSL('#ff0000');
      expect(result.h).toBe(0);
      expect(result.s).toBe(100);
      expect(result.l).toBe(50);
    });

    it('should produce same result with or without #', () => {
      const withHash = hexToHSL('#cc9166');
      const withoutHash = hexToHSL('cc9166');
      expect(withHash).toEqual(withoutHash);
    });
  });
});

describe('generateColorVariables', () => {
  describe('generating CSS variables from hex color', () => {
    it('should include the original primary color', () => {
      const result = generateColorVariables('#cc9166');
      expect(result['--color-primary']).toBe('#cc9166');
    });

    it('should include HSL components', () => {
      const result = generateColorVariables('#cc9166');
      expect(result['--color-primary-h']).toBe('25');
      expect(result['--color-primary-s']).toBe('50%');
      expect(result['--color-primary-l']).toBe('60%');
    });

    it('should generate lighter variant', () => {
      const result = generateColorVariables('#cc9166');
      expect(result['--color-primary-light']).toBe('hsl(25, 50%, 90%)');
    });

    it('should generate darker variant', () => {
      const result = generateColorVariables('#cc9166');
      expect(result['--color-primary-dark']).toBe('hsl(25, 50%, 52%)');
    });

    it('should clamp light variant to max 95%', () => {
      // Using a color that already has high lightness
      const result = generateColorVariables('#ffffff');
      expect(result['--color-primary-light']).toContain('95%');
    });

    it('should clamp dark variant to min 10%', () => {
      // Using a color that already has low lightness
      const result = generateColorVariables('#000000');
      expect(result['--color-primary-dark']).toContain('10%');
    });

    it('should return all required CSS variables', () => {
      const result = generateColorVariables('#cc9166');
      expect(Object.keys(result)).toEqual([
        '--color-primary',
        '--color-primary-h',
        '--color-primary-s',
        '--color-primary-l',
        '--color-primary-light',
        '--color-primary-dark',
      ]);
    });

    it('should work with pure colors', () => {
      const result = generateColorVariables('#ff0000');
      expect(result['--color-primary']).toBe('#ff0000');
      expect(result['--color-primary-h']).toBe('0');
      expect(result['--color-primary-s']).toBe('100%');
      expect(result['--color-primary-l']).toBe('50%');
    });
  });
});
