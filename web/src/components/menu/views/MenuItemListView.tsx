"use client";

import Image from "next/image";
import clsx from "clsx";

/**
 * Pure presentational component for the menu list card.
 *
 * Used by both the public menu (wrapped by `home/MenuItem.tsx`) and the
 * admin live preview (wrapped by `EditEntryPage`). It takes only
 * pre-resolved plain values — no store, router, or i18n hooks — so it's
 * the single source of truth for how a list-card looks. Whatever the
 * customer sees, the admin preview sees.
 */

export interface MenuItemView {
  /** Primary display name (already localized). */
  name: string;
  /** Secondary display name (e.g. fallback locale). */
  nameSecondary?: string | null;
  /** Description (already localized; may contain plain text or sanitized HTML — list view treats as text). */
  description?: string | null;
  /** Price in display units (e.g. 7.5 for €7.50). */
  price: number;
  /** Price unit (e.g. "kg"). */
  priceUnit?: string | null;
  /** Minimum quantity for the dish. */
  minQuantity?: number;
  /** Image URL. */
  image?: string | null;
  /** Allergen identifiers (e.g. "Glutine"). */
  allergens?: string[];
  /** Pre-resolved variant labels to summarize. */
  variantSummaries?: string[];
  /** Out of stock today. */
  outOfStock?: boolean;
  /** Item contains frozen ingredients. */
  containsFrozenIngredient?: boolean;
}

const ALLERGEN_SHORT: Record<string, string> = {
  "Anidride-Solforosa-e-Solfiti": "SO2",
  Arachidi: "AR",
  Crostacei: "CR",
  "Frutta-a-Guscio": "FG",
  Glutine: "GL",
  "Latte-e-Derivati": "LA",
  Lupini: "LU",
  Molluschi: "MO",
  Pesce: "PE",
  Sedano: "SE",
  Senape: "SN",
  Sesamo: "SS",
  Soia: "SO",
  Uova: "UO",
};

const ALLERGEN_FULL: Record<string, string> = {
  "Anidride-Solforosa-e-Solfiti": "Sulfites",
  Arachidi: "Peanuts",
  Crostacei: "Crustaceans",
  "Frutta-a-Guscio": "Tree Nuts",
  Glutine: "Gluten",
  "Latte-e-Derivati": "Milk & Dairy",
  Lupini: "Lupins",
  Molluschi: "Molluscs",
  Pesce: "Fish",
  Sedano: "Celery",
  Senape: "Mustard",
  Sesamo: "Sesame",
  Soia: "Soy",
  Uova: "Eggs",
};

function formatPrice(item: Pick<MenuItemView, "price" | "priceUnit" | "minQuantity">): string {
  const priceStr = `€${item.price.toFixed(2)}`;
  if (item.priceUnit) return `${priceStr}/${item.priceUnit}`;
  if (item.minQuantity && item.minQuantity > 1) return `${priceStr} (min. ${item.minQuantity})`;
  return priceStr;
}

export function MenuItemListView({ item }: { item: MenuItemView }) {
  const hasDescription = !!item.description?.trim();
  return (
    <article
      className={clsx(
        "relative border-b-2 border-gray-100 bg-white",
        item.outOfStock && "opacity-60",
      )}
    >
      <div className="px-4 py-4">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <h3
              className={clsx(
                "text-base font-medium text-gray-900",
                item.outOfStock && "line-through",
              )}
            >
              <span className="block">{item.name}</span>
              {item.nameSecondary && (
                <span className="mt-0.5 block text-xs font-medium text-gray-500 no-underline">
                  {item.nameSecondary}
                </span>
              )}
            </h3>
            {hasDescription && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.description}</p>
            )}
            {item.allergens && item.allergens.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {item.allergens.map((a) => (
                  <span
                    key={a}
                    className="inline-flex h-5 items-center rounded bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700"
                    title={ALLERGEN_FULL[a] || a}
                  >
                    {ALLERGEN_SHORT[a] || a.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
            )}
            {item.variantSummaries && item.variantSummaries.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500">{item.variantSummaries.join(" | ")}</p>
              </div>
            )}
            <p className="mt-2 font-medium tracking-wide text-gray-700">{formatPrice(item)}</p>
            {item.outOfStock && (
              <span className="mt-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Out of Stock
              </span>
            )}
            {item.containsFrozenIngredient && (
              <span className="mt-1 inline-block text-xs text-gray-400">
                * Contains frozen ingredients
              </span>
            )}
          </div>
          {item.image && (
            <div className="flex-shrink-0">
              <div className="relative h-16 w-16 overflow-hidden rounded-full bg-gray-200">
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                  loading="lazy"
                  unoptimized
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
