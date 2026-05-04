import { describe, it, expect } from 'vitest';
import { isMenuAvailableNow } from './menu-schedule';

function at(h: number, m = 0): Date {
  const d = new Date(2026, 0, 1, h, m, 0, 0);
  return d;
}

describe('isMenuAvailableNow', () => {
  // ── No schedule ──────────────────────────────────────────────────

  it('returns true when both fields are null', () => {
    expect(isMenuAvailableNow({ availableFrom: null, availableTo: null }, at(12))).toBe(true);
  });

  it('returns true when both fields are undefined', () => {
    expect(isMenuAvailableNow({}, at(12))).toBe(true);
  });

  it('returns true when availableFrom is null even if availableTo is set', () => {
    expect(isMenuAvailableNow({ availableFrom: null, availableTo: '15:00' }, at(12))).toBe(true);
  });

  it('returns true when availableTo is null even if availableFrom is set', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: null }, at(12))).toBe(true);
  });

  // ── Same-day window ──────────────────────────────────────────────

  it('same-day: returns true in the middle of the window', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(12, 30))).toBe(true);
  });

  it('same-day: returns true at the opening boundary', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(11, 0))).toBe(true);
  });

  it('same-day: returns false at the closing boundary (exclusive)', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(15, 0))).toBe(false);
  });

  it('same-day: returns false one minute before opening', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(10, 59))).toBe(false);
  });

  it('same-day: returns false one minute after closing', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(15, 1))).toBe(false);
  });

  it('same-day: returns false in the middle of the night', () => {
    expect(isMenuAvailableNow({ availableFrom: '11:00', availableTo: '15:00' }, at(2))).toBe(false);
  });

  // ── Overnight window ─────────────────────────────────────────────

  it('overnight: returns true in the evening portion', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(23))).toBe(true);
  });

  it('overnight: returns true at the opening boundary', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(22, 0))).toBe(true);
  });

  it('overnight: returns true in the early-morning portion', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(1, 30))).toBe(true);
  });

  it('overnight: returns false at the closing boundary (exclusive)', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(2, 0))).toBe(false);
  });

  it('overnight: returns false during the blocked daytime portion', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(10))).toBe(false);
  });

  it('overnight: returns false one minute before opening', () => {
    expect(isMenuAvailableNow({ availableFrom: '22:00', availableTo: '02:00' }, at(21, 59))).toBe(false);
  });

  // ── Degenerate (from === to) ──────────────────────────────────────

  it('degenerate (from === to): returns true at all times', () => {
    expect(isMenuAvailableNow({ availableFrom: '09:00', availableTo: '09:00' }, at(9))).toBe(true);
    expect(isMenuAvailableNow({ availableFrom: '09:00', availableTo: '09:00' }, at(0))).toBe(true);
    expect(isMenuAvailableNow({ availableFrom: '09:00', availableTo: '09:00' }, at(23, 59))).toBe(true);
  });

  // ── Edge: midnight boundaries ─────────────────────────────────────

  it('00:00–23:59 covers almost all day', () => {
    expect(isMenuAvailableNow({ availableFrom: '00:00', availableTo: '23:59' }, at(0, 0))).toBe(true);
    expect(isMenuAvailableNow({ availableFrom: '00:00', availableTo: '23:59' }, at(12))).toBe(true);
    expect(isMenuAvailableNow({ availableFrom: '00:00', availableTo: '23:59' }, at(23, 59))).toBe(false);
  });

  // ── Day-of-week ───────────────────────────────────────────────────
  // Reference dates: 2026-05-01 is a Friday, 2026-05-02 Saturday,
  //                  2026-05-03 Sunday, 2026-05-04 Monday.
  // (`at(...)` above uses 2026-01-01 which is a Thursday.)

  function on(year: number, month0: number, day: number, h: number, m = 0): Date {
    return new Date(year, month0, day, h, m, 0, 0);
  }

  it('availableDays null/undefined: every day passes', () => {
    expect(isMenuAvailableNow({ availableDays: null }, on(2026, 4, 4, 12))).toBe(true);
    expect(isMenuAvailableNow({}, on(2026, 4, 3, 12))).toBe(true);
  });

  it('day-only schedule (no time window): matches included day', () => {
    expect(isMenuAvailableNow({ availableDays: ['mon'] }, on(2026, 4, 4, 12))).toBe(true);
  });

  it('day-only schedule (no time window): excludes other days', () => {
    expect(isMenuAvailableNow({ availableDays: ['mon'] }, on(2026, 4, 3, 12))).toBe(false);
  });

  it('same-day window + day list: matches when day and time both match', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '12:00', availableTo: '15:00', availableDays: ['fri'] },
        on(2026, 4, 1, 13),
      ),
    ).toBe(true);
  });

  it('same-day window + day list: rejects when time is in but day is out', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '12:00', availableTo: '15:00', availableDays: ['fri'] },
        on(2026, 4, 2, 13),
      ),
    ).toBe(false);
  });

  // Anchor-to-start-day for overnight windows.

  it('overnight + day list: Fri 23:00 active when Fri is included', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '22:00', availableTo: '02:00', availableDays: ['fri'] },
        on(2026, 4, 1, 23),
      ),
    ).toBe(true);
  });

  it('overnight + day list: Sat 01:00 still counts as Fri-anchored', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '22:00', availableTo: '02:00', availableDays: ['fri'] },
        on(2026, 4, 2, 1),
      ),
    ).toBe(true);
  });

  it('overnight + day list: Sat 23:00 rejected (Sat not in list)', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '22:00', availableTo: '02:00', availableDays: ['fri'] },
        on(2026, 4, 2, 23),
      ),
    ).toBe(false);
  });

  it('overnight + day list: Sun 01:00 rejected (anchored to Sat, not in list)', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '22:00', availableTo: '02:00', availableDays: ['fri'] },
        on(2026, 4, 3, 1),
      ),
    ).toBe(false);
  });

  it('overnight wrap from Sun anchors to Sun, not Mon', () => {
    expect(
      isMenuAvailableNow(
        { availableFrom: '22:00', availableTo: '02:00', availableDays: ['sun'] },
        on(2026, 4, 4, 1),
      ),
    ).toBe(true);
  });

  it('empty availableDays array treated as "every day"', () => {
    expect(isMenuAvailableNow({ availableDays: [] }, on(2026, 4, 3, 12))).toBe(true);
  });
});
