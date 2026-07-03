"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { locales, defaultLocale } from "@/lib/i18n-config";
import { PREFERRED_LOCALE_KEY, resolveInitialLocale } from "@/lib/locale-detection";

/**
 * Root path redirects to the localized home page, preferring the diner's saved
 * locale, then a matching browser language, then the deployment default. From
 * there they pick a language and enter a menu.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(PREFERRED_LOCALE_KEY);
    const preferredLanguages = navigator.languages ?? (navigator.language ? [navigator.language] : []);
    const target = resolveInitialLocale({ stored, preferredLanguages, locales, defaultLocale });
    router.replace(`/${target}`);
  }, [router]);

  return null;
}
