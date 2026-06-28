import type { Env, MenuDataCache, CachedCategory, CachedEntry, CachedVariant, CachedExtra, CachedLabel } from '../types';

// ── Raw row types returned by D1 ─────────────────────────────────────────────

interface SettingsRow {
  name: string;
  payoff: string | null;
  chat_agent_prompt: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
  i18n: string | null;
}

interface EntryRow {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  price_unit: string | null;
  out_of_stock: number; // SQLite boolean stored as 0/1
  frozen: number;       // SQLite boolean stored as 0/1
  hidden: number;       // SQLite boolean stored as 0/1
  allergens: string | null;  // JSON TEXT
  i18n: string | null;       // JSON TEXT
}

interface VariantRow {
  id: string;
  name: string;
  description: string | null;
  selections: string | null; // JSON TEXT
  i18n: string | null;       // JSON TEXT
}

interface ExtraRow {
  id: string;
  name: string;
  type: string;
  max: number;
  options: string | null; // JSON TEXT
  i18n: string | null;    // JSON TEXT
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('[D1] JSON parse failed, degrading to null:', e);
    return null;
  }
}

interface MembershipRow {
  entry_id: string;
  menu_id: string;
}

interface LabelRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  i18n: string | null;
}

interface EntryLabelRow {
  entry_id: string;
  label_id: string;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchMenuFromD1(env: Env): Promise<MenuDataCache> {
  // Fire all queries in parallel for minimum latency.
  const [settingsResult, categoriesResult, entriesResult, membershipsResult, labelsResult, entryLabelsResult, variantsResult, extrasResult] = await Promise.all([
    env.DB.prepare(
      'SELECT name, payoff, chat_agent_prompt FROM settings WHERE id = 1'
    ).first<SettingsRow>(),

    env.DB.prepare(
      'SELECT id, name, sort_order, i18n FROM menu_categories ORDER BY sort_order ASC'
    ).all<CategoryRow>(),

    env.DB.prepare(
      'SELECT id, category_id, name, description, price, price_unit, out_of_stock, frozen, hidden, allergens, i18n FROM menu_entries ORDER BY sort_order ASC'
    ).all<EntryRow>(),

    env.DB.prepare(
      `SELECT mem.entry_id, mem.menu_id
       FROM menu_entry_memberships mem
       INNER JOIN menus m ON m.id = mem.menu_id
       WHERE m.published = 1`
    ).all<MembershipRow>(),

    env.DB.prepare(
      'SELECT id, name, color, sort_order, i18n FROM labels ORDER BY sort_order ASC'
    ).all<LabelRow>(),

    env.DB.prepare(
      'SELECT entry_id, label_id FROM entry_labels'
    ).all<EntryLabelRow>(),

    env.DB.prepare(
      'SELECT id, name, description, selections, i18n FROM menu_variants ORDER BY sort_order ASC'
    ).all<VariantRow>(),

    env.DB.prepare(
      'SELECT id, name, type, max, options, i18n FROM menu_extras'
    ).all<ExtraRow>(),
  ]);

  if (!settingsResult) {
    throw new Error('Settings row not found in D1');
  }

  // ── Group memberships and entries by categoryId for O(n) assembly ──────────
  const menuIdsByEntry = new Map<string, string[]>();
  for (const row of membershipsResult.results) {
    const menuIds = menuIdsByEntry.get(row.entry_id);
    if (menuIds) {
      menuIds.push(row.menu_id);
    } else {
      menuIdsByEntry.set(row.entry_id, [row.menu_id]);
    }
  }

  const labelIdsByEntry = new Map<string, string[]>();
  for (const row of entryLabelsResult.results) {
    const labelIds = labelIdsByEntry.get(row.entry_id);
    if (labelIds) {
      labelIds.push(row.label_id);
    } else {
      labelIdsByEntry.set(row.entry_id, [row.label_id]);
    }
  }

  const entriesByCategory = new Map<string, CachedEntry[]>();
  for (const row of entriesResult.results) {
    const entry: CachedEntry = {
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description ?? undefined,
      price: row.price,
      priceUnit: row.price_unit ?? undefined,
      outOfStock: row.out_of_stock === 1,
      containsFrozenIngredient: row.frozen === 1,
      allergens: parseJson<string[]>(row.allergens) ?? [],
      menuVisibility: row.hidden === 1 ? [] : menuIdsByEntry.get(row.id) ?? [],
      labelIds: labelIdsByEntry.get(row.id) ?? [],
      i18n: parseJson<Record<string, Record<string, string>>>(row.i18n) ?? undefined,
    };

    const bucket = entriesByCategory.get(row.category_id);
    if (bucket) {
      bucket.push(entry);
    } else {
      entriesByCategory.set(row.category_id, [entry]);
    }
  }

  // ── Build categories ──────────────────────────────────────────────────────
  const categories: CachedCategory[] = categoriesResult.results.map(row => ({
    id: row.id,
    name: row.name,
    order: row.sort_order,
    entries: entriesByCategory.get(row.id) ?? [],
    variantPaths: [], // not modelled in D1
    extraPaths: [],   // not modelled in D1
    i18n: parseJson<Record<string, Record<string, string>>>(row.i18n) ?? undefined,
  }));

  // ── Build variants ────────────────────────────────────────────────────────
  type SelectionJson = { name: string; price: number; isDefault: boolean; i18n?: Record<string, Record<string, string>> };
  const variants: CachedVariant[] = variantsResult.results.map(row => ({
    id: row.id,
    path: `variants/${row.id}`,
    name: row.name,
    description: row.description ?? undefined,
    selections: (parseJson<SelectionJson[]>(row.selections) ?? []).map(s => ({
      name: s.name,
      price: s.price,
      isDefault: s.isDefault,
      i18n: s.i18n,
    })),
    i18n: parseJson<Record<string, Record<string, string>>>(row.i18n) ?? undefined,
  }));

  // ── Build extras ──────────────────────────────────────────────────────────
  type OptionJson = { name: string; price: number; desc?: string; i18n?: Record<string, Record<string, string>> };
  const extras: CachedExtra[] = extrasResult.results.map(row => ({
    id: row.id,
    path: `extras/${row.id}`,
    name: row.name,
    max: row.max,
    type: row.type,
    extras: (parseJson<OptionJson[]>(row.options) ?? []).map(o => ({
      name: o.name,
      price: o.price,
      desc: o.desc,
      i18n: o.i18n,
    })),
    i18n: parseJson<Record<string, Record<string, string>>>(row.i18n) ?? undefined,
  }));

  const labels: CachedLabel[] = labelsResult.results.map(row => ({
    id: row.id,
    name: row.name,
    color: row.color as CachedLabel['color'],
    sortOrder: row.sort_order,
    i18n: parseJson<Record<string, Record<string, string>>>(row.i18n) ?? undefined,
  }));

  return {
    restaurant: {
      name: settingsResult.name,
      payoff: settingsResult.payoff ?? undefined,
    },
    categories,
    variants,
    extras,
    labels,
    chatAgentPrompt: settingsResult.chat_agent_prompt ?? undefined,
  };
}
