import { describe, it, expect } from 'vitest';
import { LABEL_COLOR_STYLES, labelColorStyle } from './label-colors';

describe('LABEL_COLOR_STYLES', () => {
  it('defines all five label colors', () => {
    const keys = Object.keys(LABEL_COLOR_STYLES);
    expect(keys).toEqual(expect.arrayContaining(['primary', 'green', 'amber', 'red', 'gray']));
    expect(keys).toHaveLength(5);
  });

  it('each entry has background and color strings', () => {
    for (const [, style] of Object.entries(LABEL_COLOR_STYLES)) {
      expect(typeof style.background).toBe('string');
      expect(style.background.length).toBeGreaterThan(0);
      expect(typeof style.color).toBe('string');
      expect(style.color.length).toBeGreaterThan(0);
    }
  });
});

describe('labelColorStyle', () => {
  it('returns the style for a known color', () => {
    const style = labelColorStyle('green');
    expect(style).toEqual(LABEL_COLOR_STYLES.green);
  });

  it('falls back to primary for unknown color', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = labelColorStyle('unknown' as any);
    expect(style).toEqual(LABEL_COLOR_STYLES.primary);
  });
});
