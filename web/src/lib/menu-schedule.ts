export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface MenuSchedule {
  availableFrom?: string | null;
  availableTo?: string | null;
  availableDays?: Weekday[] | null;
}

// Date.getDay() returns 0=Sun..6=Sat; map to our weekday codes.
const WEEKDAY_BY_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function weekdayBefore(day: Weekday): Weekday {
  const idx = WEEKDAY_BY_INDEX.indexOf(day);
  return WEEKDAY_BY_INDEX[(idx + 6) % 7];
}

/**
 * Returns true if the menu should be visible at the given time.
 *
 * Time-of-day rules:
 * - If either availableFrom/availableTo is null/undefined, the time check passes.
 * - If availableFrom === availableTo, the time check passes (degenerate).
 * - If availableFrom < availableTo: same-day window (e.g. 11:00–15:00).
 * - If availableFrom > availableTo: overnight window (e.g. 22:00–02:00).
 * The end boundary is exclusive (now at availableTo → not available).
 *
 * Day-of-week rules (anchor-to-start-day):
 * - If availableDays is null/undefined or empty, the day check passes.
 * - The schedule is anchored to the day the window starts on. For an overnight
 *   window, the wrap-around portion (e.g. 00:00–02:00 of the next calendar day)
 *   still counts as the previous day's slot. Example:
 *   availableDays=['fri'], 22:00→02:00 → active Fri 22:00–24:00 AND Sat 00:00–02:00.
 */
export function isMenuAvailableNow(menu: MenuSchedule, now: Date): boolean {
  const todayIdx = now.getDay();
  const today = WEEKDAY_BY_INDEX[todayIdx];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const hasTimeWindow = !!menu.availableFrom && !!menu.availableTo;
  let timeOk = true;
  let activeDay: Weekday = today;

  if (hasTimeWindow) {
    const from = hhmmToMinutes(menu.availableFrom!);
    const to = hhmmToMinutes(menu.availableTo!);
    if (from === to) {
      timeOk = true;
    } else if (from < to) {
      timeOk = nowMinutes >= from && nowMinutes < to;
      activeDay = today;
    } else {
      // Overnight: anchor to the start day. If we're past `from` today, the
      // active day is today; if we're before `to`, we're in yesterday's wrap.
      if (nowMinutes >= from) {
        timeOk = true;
        activeDay = today;
      } else if (nowMinutes < to) {
        timeOk = true;
        activeDay = weekdayBefore(today);
      } else {
        timeOk = false;
      }
    }
  }

  if (!timeOk) return false;

  const days = menu.availableDays;
  if (!days || days.length === 0) return true;
  return days.includes(activeDay);
}
