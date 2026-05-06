"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import { useRestaurantStore } from "@/stores/restaurantStore";
import { Flag } from "@/components/ui/Flag";

const ALL_LANGUAGE_OPTIONS = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "hu", label: "Magyar" },
  { code: "vec", label: "Vèneto" },
] as const;

const PREFERRED_LOCALE_KEY = "preferred-locale";
const LOCALE_SWITCH_SCROLL_KEY = "locale-switch-scroll-position";
const LOCALE_ANCHOR_SELECTOR = "[data-locale-anchor]";
const LOCALE_RESTORE_DELAYS_MS = [0, 80, 180, 320, 550, 900] as const;

type SavedLocalePosition = {
  href: string;
  anchorId?: string;
  anchorTop?: number;
  fallbackScrollY?: number;
};

type LanguagePickerProps = {
  variant?: 'floating' | 'inline';
};

export function LanguagePicker({ variant = 'floating' }: LanguagePickerProps = {}) {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const query = searchParams.toString();

  const enabledLocales = useRestaurantStore((s) => s.data?.features?.enabledLocales);
  const customLocales = useRestaurantStore((s) => s.data?.features?.customLocales);
  const customFlagByCode = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const cl of customLocales ?? []) map[cl.code] = cl.flagUrl;
    return map;
  }, [customLocales]);
  const languageOptions = useMemo(() => {
    if (enabledLocales == null) return ALL_LANGUAGE_OPTIONS;
    return ALL_LANGUAGE_OPTIONS.filter(
      (o) => o.code === "it" || enabledLocales.includes(o.code)
    );
  }, [enabledLocales]);

  const currentLanguage =
    languageOptions.find((option) => option.code === locale) ?? languageOptions[0];

  const currentHref = useMemo(() => buildCurrentHref(pathname, query), [pathname, query]);

  const links = useMemo(() => {
    return languageOptions.map((option) => ({
      ...option,
      href: buildLocalizedHref(pathname, option.code, query),
    }));
  }, [pathname, query, languageOptions]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pendingScroll = window.sessionStorage.getItem(LOCALE_SWITCH_SCROLL_KEY);
    if (!pendingScroll) return;

    let parsed: SavedLocalePosition;
    try {
      parsed = JSON.parse(pendingScroll) as SavedLocalePosition;
    } catch {
      window.sessionStorage.removeItem(LOCALE_SWITCH_SCROLL_KEY);
      return;
    }

    if (parsed.href !== currentHref) {
      return;
    }

    const timeouts = LOCALE_RESTORE_DELAYS_MS.map((delay, index) =>
      window.setTimeout(() => {
        restoreSavedLocalePosition(parsed);
        if (index === LOCALE_RESTORE_DELAYS_MS.length - 1) {
          window.sessionStorage.removeItem(LOCALE_SWITCH_SCROLL_KEY);
        }
      }, delay),
    );

    return () => {
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [currentHref]);

  const handleSelect = (href: string, nextLocale: string) => {
    if (nextLocale === locale) {
      setOpen(false);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PREFERRED_LOCALE_KEY, nextLocale);
      const savedPosition = captureLocalePosition(href);
      window.sessionStorage.setItem(LOCALE_SWITCH_SCROLL_KEY, JSON.stringify(savedPosition));
    }

    setOpen(false);
    router.push(href, { scroll: false });
  };

  const list = (
    <ul className="py-2">
      {links.map((option) => {
        const isActive = option.code === locale;
        return (
          <li key={option.code}>
            <button
              type="button"
              onClick={() => handleSelect(option.href, option.code)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <Flag code={option.code} customUrl={customFlagByCode[option.code]} decorative />
                {option.label}
              </span>
              {isActive && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const toggleButton = (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Select language"
      onClick={() => setOpen((value) => !value)}
      className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-lg"
    >
      <Flag
        code={currentLanguage.code}
        customUrl={customFlagByCode[currentLanguage.code]}
        decorative
      />
      <span>{currentLanguage.label}</span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </button>
  );

  if (variant === 'inline') {
    return (
      <div className="relative inline-block" ref={containerRef}>
        {toggleButton}
        {open && (
          <div className="absolute top-full left-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            {list}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2" ref={containerRef}>
      <div className="pointer-events-auto relative">
        {open && (
          <div className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            {list}
          </div>
        )}

        {toggleButton}
      </div>
    </div>
  );
}

function buildLocalizedHref(pathname: string, locale: string, query: string): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return query ? `/${locale}?${query}` : `/${locale}`;
  }

  segments[0] = locale;
  const localizedPath = `/${segments.join("/")}`;
  return query ? `${localizedPath}?${query}` : localizedPath;
}

function buildCurrentHref(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}

function captureLocalePosition(href: string): SavedLocalePosition {
  const anchor = findBestLocaleAnchor();

  return {
    href,
    anchorId: anchor?.id,
    anchorTop: anchor?.top,
    fallbackScrollY: window.scrollY,
  };
}

function findBestLocaleAnchor(): { id: string; top: number } | null {
  const anchors = Array.from(document.querySelectorAll<HTMLElement>(LOCALE_ANCHOR_SELECTOR));
  if (anchors.length === 0) {
    return null;
  }

  const viewportReferenceTop = 96;
  const visibleAnchors = anchors
    .map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
      id: element.dataset.localeAnchor,
    }))
    .filter(
      (anchor): anchor is { element: HTMLElement; rect: DOMRect; id: string } =>
        Boolean(anchor.id) && anchor.rect.bottom > 0 && anchor.rect.top < window.innerHeight,
    )
    .sort((a, b) => {
      const aDistance = Math.abs(a.rect.top - viewportReferenceTop);
      const bDistance = Math.abs(b.rect.top - viewportReferenceTop);
      return aDistance - bDistance;
    });

  const bestAnchor = visibleAnchors[0];
  if (!bestAnchor) {
    return null;
  }

  return {
    id: bestAnchor.id,
    top: bestAnchor.rect.top,
  };
}

function restoreSavedLocalePosition(savedPosition: SavedLocalePosition) {
  if (savedPosition.anchorId) {
    const anchor = document.querySelector<HTMLElement>(`[data-locale-anchor="${savedPosition.anchorId}"]`);
    if (anchor && typeof savedPosition.anchorTop === "number") {
      const delta = anchor.getBoundingClientRect().top - savedPosition.anchorTop;
      if (Math.abs(delta) > 1) {
        window.scrollBy(0, delta);
      }
      return;
    }
  }

  if (typeof savedPosition.fallbackScrollY === "number") {
    window.scrollTo(0, savedPosition.fallbackScrollY);
  }
}
