"use client";

import Image from "next/image";
import type { MenuLabel } from "@/lib/types";
import { labelColorStyle } from "@/lib/label-colors";

/**
 * Pure presentational list-card view for a menu item.
 *
 * SINGLE source of truth: used by `MenuPageClient` (the customer-facing
 * list) and the admin live preview. If the look needs to change, change
 * it here only — both will follow.
 */

export interface MenuItemView {
  /** Primary display name (already localized). */
  name: string;
  /** Secondary display name (e.g. fallback locale). */
  nameSecondary?: string | null;
  /** Description (already localized). */
  description?: string | null;
  /** Price in display units (e.g. 7.5 for €7.50). */
  price: number;
  /** Price unit (e.g. "kg"). */
  priceUnit?: string | null;
  /** Image URL. */
  image?: string | null;
  /** Allergen identifiers — surfaced in the detail view, not the list. */
  allergens?: string[];
  /** Out of stock today. */
  outOfStock?: boolean;
  /** Item contains frozen ingredients. */
  containsFrozenIngredient?: boolean;
  /** Resolved label objects for this entry. */
  labels?: MenuLabel[];
}

function formatPrice(price: number, unit?: string | null): string {
  const formatted = `€ ${price.toFixed(2).replace(".", ",")}`;
  return unit ? `${formatted}/${unit}` : formatted;
}

interface MenuItemListViewProps {
  item: MenuItemView;
  /** Localized "out of stock" badge text. */
  outOfStockLabel?: string;
  /** Optional click handler — when provided, the card is interactive. */
  onClick?: () => void;
}

export function MenuItemListView({ item, outOfStockLabel, onClick }: MenuItemListViewProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl p-4 shadow-sm flex gap-4 ${
        item.outOfStock ? "opacity-50" : ""
      } ${interactive ? "cursor-pointer hover:shadow-md transition-all" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-gray-800">
          <span className="block">{item.name}</span>
          {item.nameSecondary && (
            <span className="mt-0.5 block text-xs font-medium text-gray-500">
              {item.nameSecondary}
            </span>
          )}
        </h4>
        {item.labels && item.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.labels.map((label) => (
              <span
                key={label.id}
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={labelColorStyle(label.color)}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
        {item.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.description}</p>
        )}
        <p className="text-primary font-medium mt-2">
          {formatPrice(item.price, item.priceUnit)}
        </p>
        {item.outOfStock && outOfStockLabel && (
          <span className="text-xs text-red-500 font-medium">{outOfStockLabel}</span>
        )}
      </div>
      {item.image && (
        <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover"
            loading="lazy"
            sizes="80px"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}
