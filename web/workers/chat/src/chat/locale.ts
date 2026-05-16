import { detectAll } from 'tinyld';

const DETECTABLE_CHAT_LOCALES = ['it', 'en', 'de', 'fr', 'es', 'nl', 'ru', 'pt', 'hu'] as const;
const SUPPORTED_MENU_LOCALES = new Set([...DETECTABLE_CHAT_LOCALES, 'vec']);
const MIN_DETECTION_CHARS = 8;
const MIN_ACCURACY = 0.08;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  it: 'Italian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  nl: 'Dutch',
  ru: 'Russian',
  pt: 'Portuguese',
  hu: 'Hungarian',
  vec: 'Venetian',
};

export function detectChatLocale(text: string, fallbackLocale: string): string {
  const fallback = normalizeLocale(fallbackLocale);
  const normalized = text.trim();
  const letterCount = Array.from(normalized).filter(char => /\p{L}/u.test(char)).length;
  if (letterCount < MIN_DETECTION_CHARS) return fallback;

  const candidates = detectAll(normalized, { only: [...DETECTABLE_CHAT_LOCALES] });
  const best = candidates[0];
  if (!best || !SUPPORTED_MENU_LOCALES.has(best.lang)) return fallback;
  if (best.accuracy < MIN_ACCURACY && candidates.length > 1) return fallback;

  return best.lang;
}

export function detectChatLocaleFromMessages(
  messages: Array<{ role: string; content: string }>,
  fallbackLocale: string,
): string {
  const text = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');

  return detectChatLocale(text, fallbackLocale);
}

export function languageNameForLocale(locale: string): string {
  return LANGUAGE_NAMES[locale] ?? LANGUAGE_NAMES[normalizeLocale(locale)];
}

function normalizeLocale(locale: string): string {
  return SUPPORTED_MENU_LOCALES.has(locale) ? locale : 'en';
}
