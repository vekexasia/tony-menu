import type { MenuLabel } from './types';

type LabelColor = MenuLabel['color'];

export const LABEL_COLOR_STYLES: Record<LabelColor, { background: string; color: string }> = {
  primary: { background: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  green:   { background: '#E6F4EC', color: '#1F8E5A' },
  amber:   { background: '#FEF3C7', color: '#92400E' },
  red:     { background: '#FEE2E2', color: '#DC2626' },
  gray:    { background: '#F0EEEA', color: '#9A9590' },
};

export function labelColorStyle(color: LabelColor): { background: string; color: string } {
  return LABEL_COLOR_STYLES[color] ?? LABEL_COLOR_STYLES.primary;
}
