"use client";

import { createContext, useContext, ReactNode } from "react";

// Import messages
import itMessages from "../../messages/it.json";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import frMessages from "../../messages/fr.json";
import esMessages from "../../messages/es.json";
import nlMessages from "../../messages/nl.json";
import ruMessages from "../../messages/ru.json";
import ptMessages from "../../messages/pt.json";
import vecMessages from "../../messages/vec.json";

// Re-export from config for convenience
export { locales, defaultLocale, type Locale } from "./i18n-config"
import { locales, defaultLocale, type Locale } from "./i18n-config";

type Messages = typeof itMessages;

const messagesMap: Record<Locale, Messages> = {
  it: itMessages,
  en: enMessages,
  de: deMessages,
  fr: frMessages,
  es: esMessages,
  nl: nlMessages,
  ru: ruMessages,
  pt: ptMessages,
  vec: vecMessages,
};

export function getMessage(locale: string, key: string): string {
  const validLocale = (locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : defaultLocale;
  const val = (messagesMap[validLocale] as Record<string, unknown>)[key];
  return typeof val === "string" ? val : key;
}

type I18nContextType = {
  locale: Locale;
  messages: Messages;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const validLocale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale;
  const messages = messagesMap[validLocale];

  const t = (key: string): string => {
    const val = (messages as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : key;
  };

  return (
    <I18nContext.Provider value={{ locale: validLocale, messages, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Returns a translation function for the given namespace (or top-level keys if omitted).
 *
 * Usage:
 *   const t = useTranslations();          // t('key') → messages.key
 *   const t = useTranslations('chat');    // t('key') → messages.chat.key
 */
export function useTranslations(namespace?: string) {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslations must be used within I18nProvider");
  }

  if (!namespace) {
    return context.t;
  }

  const ns = (context.messages as Record<string, unknown>)[namespace];
  return (key: string): string => {
    if (ns && typeof ns === 'object') {
      const val = (ns as Record<string, unknown>)[key];
      return typeof val === 'string' ? val : key;
    }
    return key;
  };
}

export function useLocale(): Locale {
  const context = useContext(I18nContext);
  if (!context) {
    return defaultLocale;
  }
  return context.locale;
}
