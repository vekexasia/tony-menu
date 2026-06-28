"use client";

import Image from "next/image";
import type { MenuItemView } from "./MenuItemListView";
import { labelColorStyle } from "@/lib/label-colors";
import { formatPrice, sanitizeRichText } from "@/lib/utils";

/**
 * Pure presentational component for the menu item detail (expanded) view.
 *
 * Same contract as `MenuItemListView` — plain props only, no hooks. Used
 * by the public detail dialog and the admin edit-page preview, so the
 * customer view and the admin preview always render identically.
 */

const ALLERGEN_NAMES: Record<string, string> = {
  "Anidride-Solforosa-e-Solfiti": "Solfiti",
  Arachidi: "Arachidi",
  Crostacei: "Crostacei",
  "Frutta-a-Guscio": "Frutta Guscio",
  Glutine: "Glutine",
  "Latte-e-Derivati": "Latte e D.",
  Lupini: "Lupini",
  Molluschi: "Molluschi",
  Pesce: "Pesce",
  Sedano: "Sedano",
  Senape: "Senape",
  Sesamo: "Sesamo",
  Soia: "Soia",
  Uova: "Uova",
};




export interface MenuItemDetailViewProps {
  item: MenuItemView;
  /** Hide the price (used in AI chat context). */
  hidePrice?: boolean;
  /** Allergy-warning footnote text, already localized. */
  allergyWarning?: string;
  /** Frozen-product footnote text, already localized. */
  frozenWarning?: string;
}

export function MenuItemDetailView({ item, hidePrice, allergyWarning, frozenWarning }: MenuItemDetailViewProps) {
  return (
    <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
      {item.image && (
        <div className="relative w-full aspect-[4/3] bg-gray-200">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <div className="p-6 pb-8">
        {item.image ? (
          <div className="flex justify-between items-start gap-4 mb-3">
            <h2 className="text-2xl font-bold text-gray-800 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span>{item.name}</span>
                {item.internalCode && (
                  <span className="font-mono text-sm font-normal text-gray-400 shrink-0 mt-1">{item.internalCode}</span>
                )}
              </span>
            </h2>
            {!hidePrice && (
              <span className="text-2xl font-bold text-primary whitespace-nowrap">
                {formatPrice(item.price, item.priceUnit)}
              </span>
            )}
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">
              <span className="flex items-start justify-between gap-2">
                <span>{item.name}</span>
                {item.internalCode && (
                  <span className="font-mono text-sm font-normal text-gray-400 shrink-0 mt-1">{item.internalCode}</span>
                )}
              </span>
            </h2>
            {!hidePrice && (
              <div className="text-2xl font-bold text-primary mb-2">
                {formatPrice(item.price, item.priceUnit)}
              </div>
            )}
          </>
        )}
        {item.labels && item.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {item.labels.map((label) => (
              <span
                key={label.id}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={labelColorStyle(label.color)}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
        {item.allergens && item.allergens.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {item.allergens.map((a) => (
                <Image
                  key={a}
                  src={`/images/allergeni-${a}.png`}
                  alt={ALLERGEN_NAMES[a] || a}
                  title={ALLERGEN_NAMES[a] || a}
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              ))}
            </div>
            {allergyWarning && <p className="text-xs text-gray-500 italic">{allergyWarning}</p>}
          </div>
        )}
        {item.description && (
          <p
            className="text-gray-600 mb-4 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(item.description) }}
          />
        )}
        {item.containsFrozenIngredient && frozenWarning && (
          <p className="text-xs text-gray-500 italic">{frozenWarning}</p>
        )}
      </div>
    </div>
  );
}
