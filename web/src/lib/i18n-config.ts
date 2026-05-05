// Shared i18n config - can be imported by both server and client code
export const locales = ["it", "en", "de", "fr", "es", "nl", "ru", "pt", "hu", "vec"] as const;
export type Locale = (typeof locales)[number];

const FALLBACK_DEFAULT_LOCALE: Locale = "en";

function resolveDefaultLocale(): Locale {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  if (fromEnv && (locales as readonly string[]).includes(fromEnv)) {
    return fromEnv as Locale;
  }
  return FALLBACK_DEFAULT_LOCALE;
}

export const defaultLocale: Locale = resolveDefaultLocale();

function resolveAdminLocale(): Locale {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_LOCALE;
  if (fromEnv && (locales as readonly string[]).includes(fromEnv)) {
    return fromEnv as Locale;
  }
  return defaultLocale;
}

export const adminLocale: Locale = resolveAdminLocale();
