export interface MenuSchedule {
  availableFrom?: string | null;
  availableTo?: string | null;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true if the menu should be visible at the given time.
 *
 * Rules:
 * - If either field is null/undefined, the menu is always available.
 * - If availableFrom === availableTo, the menu is always available (degenerate).
 * - If availableFrom < availableTo: same-day window (e.g. 11:00–15:00).
 * - If availableFrom > availableTo: overnight window (e.g. 22:00–02:00).
 * The end boundary is exclusive (now at availableTo → not available).
 */
export function isMenuAvailableNow(menu: MenuSchedule, now: Date): boolean {
  if (!menu.availableFrom || !menu.availableTo) return true;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const from = hhmmToMinutes(menu.availableFrom);
  const to = hhmmToMinutes(menu.availableTo);
  if (from === to) return true;
  if (from < to) {
    return nowMinutes >= from && nowMinutes < to;
  }
  // overnight
  return nowMinutes >= from || nowMinutes < to;
}
