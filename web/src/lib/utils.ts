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
 * Format a price for display: "€ 12,50" or "€ 12,50/kg".
 * Italian locale uses a comma as the decimal separator.
 */
export function formatPrice(price: number, unit?: string | null): string {
  const formatted = `€ ${price.toFixed(2).replace('.', ',')}`;
  return unit ? `${formatted}/${unit}` : formatted;
}

/**
 * Escape an untrusted string for HTML, then re-allow the inline formatting
 * tags <b>, <i>, <u>. Safe for dangerouslySetInnerHTML.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return '';
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;(\/?)b&gt;/gi, '<$1b>')
    .replace(/&lt;(\/?)i&gt;/gi, '<$1i>')
    .replace(/&lt;(\/?)u&gt;/gi, '<$1u>');
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

