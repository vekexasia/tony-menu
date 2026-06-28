// Keep the curated list local to the web side. It MUST stay in sync with
// MENU_ICONS in `packages/schemas/src/catalog.ts` — the backend zod enum
// validates writes against the same set. Re-exporting from @menu/schemas
// breaks Turbopack's barrel resolution at the moment.
export const MENU_ICON_KINDS = [
  "utensils",
  "lunch",
  "dinner",
  "breakfast",
  "wine",
  "beer",
  "cocktail",
  "coffee",
  "pizza",
  "burger",
  "dessert",
  "salad",
  "fish",
  "bread",
] as const;
export type MenuIconKind = (typeof MENU_ICON_KINDS)[number];


const FALLBACK_KIND: MenuIconKind = "utensils";

function isMenuIconKind(value: string | null | undefined): value is MenuIconKind {
  return !!value && (MENU_ICON_KINDS as readonly string[]).includes(value);
}

interface MenuIconProps {
  /** Stored icon kind. Unknown values fall back to "utensils". */
  kind: string | null | undefined;
  className?: string;
}

/**
 * Inline SVG icons. The public layout doesn't load Font Awesome, so we render
 * everything inline. Strokes use currentColor so a parent can theme them.
 */
export function MenuIcon({ kind, className }: MenuIconProps) {
  const resolved: MenuIconKind = isMenuIconKind(kind) ? kind : FALLBACK_KIND;
  const cls = className ?? "w-full h-full";

  switch (resolved) {
    case "utensils":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M7 3v8a2 2 0 0 0 4 0V3" />
          <path d="M9 11v10" />
          <path d="M17 3c-1.5 0-3 1.5-3 4s1.5 4 3 4v10" />
        </svg>
      );
    case "lunch":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <circle cx="12" cy="7" r="2.5" />
          <path d="M12 2v1.5M12 10.5v1M5.5 7H7M17 7h1.5M7.5 2.5l1 1M16.5 2.5l-1 1M7.5 11.5l1-1M16.5 11.5l-1-1" />
          <ellipse cx="12" cy="18" rx="8" ry="1.8" />
          <path d="M4 18c0 1.5 3.5 3 8 3s8-1.5 8-3" />
        </svg>
      );
    case "dinner":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M14 3a5 5 0 1 0 4 8 5.5 5.5 0 0 1-4-8z" />
          <ellipse cx="12" cy="18" rx="8" ry="1.8" />
          <path d="M4 18c0 1.5 3.5 3 8 3s8-1.5 8-3" />
        </svg>
      );
    case "wine":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M8 3h8c0 5-1.8 9-4 9s-4-4-4-9z" />
          <path d="M12 12v7" />
          <path d="M9 21h6" />
        </svg>
      );
    case "beer":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <rect x="6" y="6" width="10" height="14" rx="1" />
          <path d="M16 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
          <path d="M9 10v6" />
          <path d="M12 10v6" />
        </svg>
      );
    case "cocktail":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M4 5h16l-8 8z" />
          <path d="M12 13v7" />
          <path d="M8 21h8" />
          <path d="M17 4l3-2" />
        </svg>
      );
    case "coffee":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M5 9h12v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
          <path d="M17 11h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-2" />
          <path d="M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2" />
        </svg>
      );
    case "pizza":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M12 3l9 17H3z" />
          <circle cx="10" cy="13" r="1" fill="currentColor" />
          <circle cx="14" cy="14" r="1" fill="currentColor" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case "burger":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 9c0-3 4-5 9-5s9 2 9 5" />
          <path d="M3 12h18" />
          <path d="M3 15h18" />
          <path d="M5 18h14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
        </svg>
      );
    case "dessert":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M9 9h6l-3 12z" />
          <circle cx="12" cy="6" r="3" />
        </svg>
      );
    case "salad":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 12h18l-1 4a4 4 0 0 1-4 3H8a4 4 0 0 1-4-3z" />
          <path d="M9 11c0-3 3-5 6-5" />
          <path d="M15 11c0-2 2-3 4-3" />
        </svg>
      );
    case "fish":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M3 12c4-5 9-5 13 0-4 5-9 5-13 0z" />
          <path d="M16 8l4-3-1 7 1 7-4-3" />
          <circle cx="8" cy="11" r="0.6" fill="currentColor" />
        </svg>
      );
    case "bread":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <path d="M4 11c0-3 4-5 8-5s8 2 8 5l-1 7H5z" />
          <path d="M9 9l-1 9M15 9l1 9" />
        </svg>
      );
    case "breakfast":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={cls}>
          <ellipse cx="12" cy="13" rx="8" ry="4" />
          <ellipse cx="12" cy="11" rx="3" ry="2" fill="currentColor" />
        </svg>
      );
  }
}

export default MenuIcon;
