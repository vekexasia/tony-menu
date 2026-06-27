import type { MenuDataCache, CachedVariant, CachedExtra } from '../types';

function getLocalized(
  item: { i18n?: Record<string, Record<string, string>> },
  field: string,
  locale: string
): string {
  const translated = item.i18n?.[locale]?.[field];
  if (translated) return translated;
  const base = (item as Record<string, unknown>)[field];
  return typeof base === 'string' ? base : '';
}

// Allergen id -> human-readable name
export const ALLERGEN_NAMES: Record<string, string> = {
  'Anidride-Solforosa-e-Solfiti': 'Sulfites',
  'Arachidi': 'Peanuts',
  'Crostacei': 'Crustaceans',
  'Frutta-a-Guscio': 'Tree Nuts',
  'Glutine': 'Gluten',
  'Latte-e-Derivati': 'Milk/Dairy',
  'Lupini': 'Lupins',
  'Molluschi': 'Mollusks',
  'Pesce': 'Fish',
  'Sedano': 'Celery',
  'Senape': 'Mustard',
  'Sesamo': 'Sesame',
  'Soia': 'Soy',
  'Uova': 'Eggs',
};

/**
 * Lean serialization for the system prompt: names, descriptions, IDs only.
 * Prices, allergens, variants, and extras are available via server-side tools.
 */
export function serializeMenuForPrompt(data: MenuDataCache, locale: string): string {
  const lines: string[] = [];

  lines.push(`# Menu: ${data.restaurant.name}`);
  if (data.restaurant.payoff) lines.push(data.restaurant.payoff);
  lines.push('');

  const labelsById = new Map((data.labels ?? []).map(label => [label.id, label]));

  for (const cat of data.categories) {
    // Collect visible entries first
    const visibleEntries = cat.entries.filter(e => e.menuVisibility.length > 0);
    if (visibleEntries.length === 0) continue;

    const catName = getLocalized(cat, 'name', locale);
    lines.push(`### ${catName} [category:${cat.id}]`);
    lines.push('');

    for (const entry of visibleEntries) {
      const name = getLocalized(entry, 'name', locale);
      const desc = getLocalized(entry, 'description', locale);

      let line = `- **${name}** [id:${entry.id}]`;
      const labels = (entry.labelIds ?? [])
        .map(id => labelsById.get(id))
        .filter((label): label is NonNullable<ReturnType<typeof labelsById.get>> => Boolean(label))
        .map(label => getLocalized(label, 'name', locale));
      if (labels.length > 0) line += ` [labels:${labels.join(', ')}]`;
      if (entry.outOfStock) line += ' (OUT OF STOCK)';
      if (entry.containsFrozenIngredient) line += ' *contains frozen ingredients*';
      if (desc) {
        // Truncate to 120 chars — enough for ingredients/flavors, avoids ballooning the prompt.
        // Full details (allergens, variants) remain available via get_item_detail.
        const truncated = desc.length > 120 ? desc.slice(0, 117) + '…' : desc;
        line += ` — ${truncated}`;
      }
      lines.push(line);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get full item detail for the get_item_detail server-side tool.
 * NOTE: Prices are intentionally excluded — the AI chat must never display pricing.
 */
export function getItemDetail(
  data: MenuDataCache,
  itemId: string,
  locale: string
): Record<string, unknown> | null {
  for (const cat of data.categories) {
    for (const entry of cat.entries) {
      if (entry.id !== itemId) continue;

      const name = getLocalized(entry, 'name', locale);
      const desc = getLocalized(entry, 'description', locale);
      const allergenNames = entry.allergens.map(a => ALLERGEN_NAMES[a] || a);

      const result: Record<string, unknown> = {
        id: entry.id,
        name,
        category: getLocalized(cat, 'name', locale),
      };
      if (desc) result.description = desc;
      if (allergenNames.length > 0) result.allergens = allergenNames;
      if (entry.outOfStock) result.outOfStock = true;
      if (entry.containsFrozenIngredient) result.containsFrozenIngredient = true;

      // Variants
      const variantMap = new Map<string, CachedVariant>();
      for (const v of data.variants) variantMap.set(v.path, v);

      const variantPaths = entry.overriddenVariantPaths ?? cat.variantPaths;
      const variants: Record<string, unknown>[] = [];
      for (const vp of variantPaths) {
        const variant = variantMap.get(vp);
        if (!variant) continue;
        const vName = getLocalized(variant, 'name', locale);
        const options = variant.selections.map(s => {
          const sName = s.i18n?.[locale]?.name || s.name;
          const r: Record<string, unknown> = { name: sName };
          if (s.isDefault) r.default = true;
          return r;
        });
        variants.push({ name: vName, options });
      }
      if (variants.length > 0) result.variants = variants;

      // Extras
      const extraMap = new Map<string, CachedExtra>();
      for (const e of data.extras) extraMap.set(e.path, e);

      const extraPaths = entry.overriddenExtraPaths ?? cat.extraPaths;
      const extras: Record<string, unknown>[] = [];
      for (const ep of extraPaths) {
        const extra = extraMap.get(ep);
        if (!extra) continue;
        const eName = getLocalized(extra, 'name', locale);
        const options = extra.extras.map(e => {
          const exName = e.i18n?.[locale]?.name || e.name;
          const r: Record<string, unknown> = { name: exName };
          return r;
        });
        extras.push({ name: eName, options });
      }
      if (extras.length > 0) result.extras = extras;

      return result;
    }
  }
  return null;
}

/**
 * Search items WITHOUT specified allergens for the search_by_allergens server-side tool.
 */
export function searchByAllergens(
  data: MenuDataCache,
  excludeAllergens: string[],
  locale: string
): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const excludeSet = new Set(excludeAllergens);

  for (const cat of data.categories) {
    for (const entry of cat.entries) {
      if (entry.menuVisibility.length === 0) continue;
      if (entry.outOfStock) continue;

      const hasExcluded = entry.allergens.some(a => excludeSet.has(a));
      if (hasExcluded) continue;

      const name = getLocalized(entry, 'name', locale);
      const allergenNames = entry.allergens.map(a => ALLERGEN_NAMES[a] || a);

      results.push({
        id: entry.id,
        name,
        category: getLocalized(cat, 'name', locale),
        allergens: allergenNames.length > 0 ? allergenNames : 'none',
      });
    }
  }
  return results;
}
