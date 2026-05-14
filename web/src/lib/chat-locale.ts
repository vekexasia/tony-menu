import { locales, type Locale } from './i18n-config';

const SUPPORTED_LOCALES = new Set<string>(locales);

const LANGUAGE_PATTERNS: Array<{ locale: Locale; patterns: RegExp[] }> = [
  { locale: 'ru', patterns: [/[\u0400-\u04FF]/] },
  { locale: 'it', patterns: [/\b(vorrei|voglio|posso|senza|con|antipast[oi]|primi?|second[oi]|dolc[ei]|formaggio|vino|acqua|pesce|carne|consigli|consiglia)\b/i] },
  { locale: 'de', patterns: [/\b(ich|möchte|moechte|ohne|mit|gericht|speisekarte|wein|wasser|fleisch|fisch|vegetarisch|empfiehl|empfehlen)\b/i] },
  { locale: 'fr', patterns: [/\b(je|voudrais|sans|avec|entrée|entree|plat|dessert|vin|eau|poisson|viande|végétarien|vegetarien|conseille)\b/i] },
  { locale: 'es', patterns: [/\b(quiero|quisiera|sin|con|entrante|plato|postre|vino|agua|pescado|carne|vegetariano|recomienda)\b/i] },
  { locale: 'pt', patterns: [/\b(quero|gostaria|sem|com|entrada|prato|sobremesa|vinho|água|agua|peixe|carne|vegetariano|recomenda)\b/i] },
  { locale: 'nl', patterns: [/\b(ik|wil|graag|zonder|met|gerecht|wijn|water|vis|vlees|vegetarisch|aanraden)\b/i] },
  { locale: 'hu', patterns: [/\b(szeretnék|szeretnek|nélkül|nelkul|étel|etel|bor|víz|viz|hal|hús|hus|vegetáriánus|vegetarianus)\b/i] },
];

function normalizeFallback(locale: string): Locale {
  return SUPPORTED_LOCALES.has(locale) ? locale as Locale : 'en';
}

export function detectChatLocale(message: string, fallbackLocale: string): Locale {
  const trimmed = message.trim();
  if (!trimmed) return normalizeFallback(fallbackLocale);

  for (const candidate of LANGUAGE_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(trimmed))) return candidate.locale;
  }

  return normalizeFallback(fallbackLocale);
}
