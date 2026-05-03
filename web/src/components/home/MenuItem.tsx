'use client';

import type { MenuEntry, Variant, RestaurantData } from '@/lib/types';
import { useRestaurantStore } from '@/stores/restaurantStore';
import { getContentDisplayText, getLocalizedContentValue } from '@/lib/content-presentation';
import { MenuItemListView } from '@/components/menu/views/MenuItemListView';

interface MenuItemProps {
  /** The menu entry to display */
  entry: MenuEntry;
  /** Restaurant data for category lookup */
  restaurant: RestaurantData;
  /** Optional locale for i18n */
  locale?: string;
}

/**
 * MenuItem resolves the entry's localized data and delegates rendering to
 * the shared `MenuItemListView` component, which is also used by the admin
 * preview so the two views can never visually drift.
 */
export function MenuItem({ entry, restaurant, locale }: MenuItemProps) {
  const getVariant = useRestaurantStore((state) => state.getVariant);
  const name = getContentDisplayText({ entity: entry, field: 'name', locale, restaurantId: restaurant.id });
  const description = getLocalizedContentValue(entry, 'description', locale);
  const variants = getEntryVariants(entry, restaurant, getVariant);
  const variantSummaries = variants.map((v) => getVariantName(v, locale));

  return (
    <MenuItemListView
      item={{
        name: name.primary,
        nameSecondary: name.secondary,
        description,
        price: entry.price,
        priceUnit: entry.priceUnit,
        minQuantity: entry.minQuantity,
        image: entry.image,
        allergens: entry.allergens,
        variantSummaries,
        outOfStock: entry.outOfStock,
        containsFrozenIngredient: entry.containsFrozenIngredient,
      }}
    />
  );
}

function getEntryVariants(
  entry: MenuEntry,
  restaurant: RestaurantData,
  getVariant: (path: string) => Variant | undefined,
): Variant[] {
  const variantPaths = entry.overriddenVariantPaths;
  if (!variantPaths || variantPaths.length === 0) {
    const category = restaurant.categories.find((c) => c.path === entry.categoryPath);
    if (!category || !category.variantPaths) return [];
    return category.variantPaths
      .map((path) => getVariant(path))
      .filter((v): v is Variant => v !== undefined);
  }
  return variantPaths.map((path) => getVariant(path)).filter((v): v is Variant => v !== undefined);
}

function getVariantName(variant: Variant, locale?: string): string {
  if (!locale || !variant.i18n) return variant.name;
  const translation = variant.i18n[locale];
  return translation?.name || variant.name;
}

export default MenuItem;
