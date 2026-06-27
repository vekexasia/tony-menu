import IT from "country-flag-icons/string/3x2/IT";
import GB from "country-flag-icons/string/3x2/GB";
import DE from "country-flag-icons/string/3x2/DE";
import FR from "country-flag-icons/string/3x2/FR";
import ES from "country-flag-icons/string/3x2/ES";
import NL from "country-flag-icons/string/3x2/NL";
import RU from "country-flag-icons/string/3x2/RU";
import PT from "country-flag-icons/string/3x2/PT";
import HU from "country-flag-icons/string/3x2/HU";

export const LOCALE_FLAG_SVG: Record<string, string> = {
  it: IT,
  en: GB,
  de: DE,
  fr: FR,
  es: ES,
  nl: NL,
  ru: RU,
  pt: PT,
  hu: HU,
};

// Display name and short code for each standard (built-in) locale.
export const LOCALE_LABELS: Record<string, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  nl: "Nederlands",
  ru: "Русский",
  pt: "Português",
  hu: "Magyar",
};

export const LOCALE_SHORT_CODES: Record<string, string> = {
  it: "IT", en: "EN", de: "DE", fr: "FR", es: "ES", nl: "NL", ru: "RU", pt: "PT", hu: "HU",
};

export function getBundledFlagSvg(locale: string): string | null {
  return LOCALE_FLAG_SVG[locale] ?? null;
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
