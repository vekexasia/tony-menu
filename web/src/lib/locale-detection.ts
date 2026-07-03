export const PREFERRED_LOCALE_KEY = "preferred-locale";

export function resolveInitialLocale({
  stored,
  preferredLanguages,
  locales,
  defaultLocale,
}: {
  stored: string | null;
  preferredLanguages: readonly string[];
  locales: readonly string[];
  defaultLocale: string;
}): string {
  if (stored && locales.includes(stored)) return stored;
  for (const lang of preferredLanguages) {
    const base = lang.split("-")[0].toLowerCase();
    if (locales.includes(base)) return base;
  }
  return defaultLocale;
}
