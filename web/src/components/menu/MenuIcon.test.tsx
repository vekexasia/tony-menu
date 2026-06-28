import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MENU_ICONS } from '@menu/schemas';
import { MenuIcon, MENU_ICON_KINDS } from './MenuIcon';

describe('MENU_ICON_KINDS / MENU_ICONS drift', () => {
  it('the web kinds match the schemas package zod enum exactly', () => {
    // Drift safety net: backend validates writes against MENU_ICONS in
    // packages/schemas; the web side renders against MENU_ICON_KINDS in this
    // file. If these diverge, owners can save a kind the renderer doesn't know
    // and the home card will silently fall back. Keep them lockstep.
    expect([...MENU_ICON_KINDS]).toEqual([...MENU_ICONS]);
  });
});

describe('<MenuIcon>', () => {
  it('renders an svg for every known kind', () => {
    for (const kind of MENU_ICON_KINDS) {
      const { container, unmount } = render(<MenuIcon kind={kind} />);
      const svg = container.querySelector('svg');
      expect(svg, `kind ${kind}`).not.toBeNull();
      // Each kind must produce at least one geometry child — a missing case
      // would render an empty <svg/> with the parent JSX wrapper still valid.
      expect(svg?.childElementCount ?? 0, `kind ${kind} svg has no children`).toBeGreaterThan(0);
      unmount();
    }
  });

  it('falls back to utensils for unknown kinds', () => {
    const utensils = render(<MenuIcon kind="utensils" />);
    const fallback = render(<MenuIcon kind="not-a-real-icon" />);
    // Same SVG markup => fallback is the utensils case, not a blank.
    expect(fallback.container.innerHTML).toBe(utensils.container.innerHTML);
    utensils.unmount();
    fallback.unmount();
  });

  it('falls back to utensils for null/undefined', () => {
    const utensils = render(<MenuIcon kind="utensils" />);
    const nullCase = render(<MenuIcon kind={null} />);
    const undefCase = render(<MenuIcon kind={undefined} />);
    expect(nullCase.container.innerHTML).toBe(utensils.container.innerHTML);
    expect(undefCase.container.innerHTML).toBe(utensils.container.innerHTML);
    utensils.unmount();
    nullCase.unmount();
    undefCase.unmount();
  });
});
