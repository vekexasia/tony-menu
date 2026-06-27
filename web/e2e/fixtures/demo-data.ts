// Canonical demo expectations sourced directly from the backend seed
// (backend/src/lib/demo-reset.ts). The e2e backend serves exactly this data
// after `POST /admin/demo/reset`, so specs assert against the source of truth
// and never drift when the demo menu changes.
import { settings, categories, menus } from "../../../backend/src/lib/demo-seed-data";

export const DEMO = {
  /** Restaurant display name (header h1 renders it upper-cased). */
  name: settings.name,
  nameUpper: settings.name.toUpperCase(),
  payoff: settings.payoff,
  primaryLocale: settings.primaryLocale,
  /** Address fields rendered by the /info page and the info modal. */
  addressLine1: settings.info.addressLine1,
  city: settings.info.city,
  zip: settings.info.zip,
  region: settings.info.region,
  phone: settings.info.phone,
  /** A weekday with no slots in the seed schedule renders as "closed". */
  hasClosedDay: settings.openingSchedule.schedule.some((slots) => slots.length === 0),
} as const;

/** Published menu codes from the seed (home renders one selection card per menu). */
export const DEMO_MENU_CODES = menus.map((m) => m.code);

/** Localized category name from the seed, e.g. categoryName("starters","it") -> "Antipasti". */
export function categoryName(idSuffix: string, locale: string): string {
  const cat = categories.find((c) => c.id === `demo-cat-${idSuffix}`);
  if (!cat) throw new Error(`demo category demo-cat-${idSuffix} not found in seed`);
  const i18n = cat.i18n as Record<string, { name?: string } | undefined>;
  return i18n[locale]?.name ?? cat.name;
}
