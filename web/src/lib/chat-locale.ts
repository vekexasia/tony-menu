import { detectAll } from 'tinyld';
import { locales, type Locale } from './i18n-config';

const SUPPORTED_LOCALES = new Set<string>(locales);
const DETECTABLE_CHAT_LOCALES = ['it', 'en', 'de', 'fr', 'es', 'nl', 'ru', 'pt', 'hu'] as const;
const MIN_DETECTION_CHARS = 8;
const MIN_ACCURACY = 0.08;

function normalizeFallback(locale: string): Locale {
  return SUPPORTED_LOCALES.has(locale) ? locale as Locale : 'en';
}

export function detectChatLocale(message: string, fallbackLocale: string): Locale {
  const fallback = normalizeFallback(fallbackLocale);
  const trimmed = message.trim();
  const letterCount = Array.from(trimmed).filter(char => /\p{L}/u.test(char)).length;
  if (letterCount < MIN_DETECTION_CHARS) return fallback;

  const candidates = detectAll(trimmed, { only: [...DETECTABLE_CHAT_LOCALES] });
  const best = candidates[0];
  if (!best || !SUPPORTED_LOCALES.has(best.lang)) return fallback;
  if (best.accuracy < MIN_ACCURACY && candidates.length > 1) return fallback;

  return best.lang as Locale;
}
