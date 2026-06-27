import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes.
 * Combines clsx for conditional classes with tailwind-merge to handle conflicts.
 *
 * @example
 * cn('px-4 py-2', isPrimary && 'bg-primary', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Resolve a translation key and interpolate {name} placeholders.
 * @example formatMessage(t, 'selection.link', { count: 3 })
 */
export function formatMessage(
  t: (key: string) => string,
  key: string,
  values: Record<string, string | number>,
): string {
  let value = t(key);
  for (const [name, replacement] of Object.entries(values)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

/**
 * Format a price for display.
 * Uses Euro format with comma as decimal separator (Italian locale).
 *
 * @param price - The price in cents or as a decimal
 * @param showCurrency - Whether to show the currency symbol
 * @returns Formatted price string (e.g., "12,50 €")
 */
export function formatPrice(price: number, showCurrency = true): string {
  const formatted = price.toFixed(2).replace('.', ',');
  return showCurrency ? `${formatted} €` : formatted;
}

/**
 * Convert a hex color string to HSL components.
 * Useful for generating lighter/darker variants of theme colors.
 *
 * @param hex - Hex color string (e.g., "#cc9166" or "cc9166")
 * @returns Object with h, s, l values (0-360 for h, 0-100 for s and l)
 */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse hex values
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Returns a client-side dedupe key for view tracking, unique per entry per calendar day.
 *
 * Including the date ensures that a tab left open across midnight allows legitimate
 * re-tracking of the same item on the new calendar day. The format matches the backend's
 * dateBucket convention (YYYYMMDD integer).
 *
 * @example
 * viewDedupeKey('entry-123') // e.g. "entry-123:20240615"
 */
export function viewDedupeKey(entryId: string): string {
  const d = new Date();
  const bucket = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return `${entryId}:${bucket}`;
}

/**
 * Generate CSS variables for the primary color and its variants.
 * Creates lighter and darker variants for hover states and backgrounds.
 *
 * @param primaryColor - The primary hex color (e.g., "#cc9166")
 * @returns CSS custom properties object
 */
export function generateColorVariables(primaryColor: string): Record<string, string> {
  const hsl = hexToHSL(primaryColor);

  return {
    '--color-primary': primaryColor,
    '--color-primary-h': String(hsl.h),
    '--color-primary-s': `${hsl.s}%`,
    '--color-primary-l': `${hsl.l}%`,
    '--color-primary-light': `hsl(${hsl.h}, ${hsl.s}%, ${Math.min(hsl.l + 30, 95)}%)`,
    '--color-primary-dark': `hsl(${hsl.h}, ${hsl.s}%, ${Math.max(hsl.l - 8, 10)}%)`,
  };
}
