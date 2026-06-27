import {
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SQLite has no native timestamp type. We store Unix milliseconds as integer.
 * All createdAt/updatedAt values round-trip correctly with new Date().getTime().
 */
const timestamps = {
  createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at').notNull().$defaultFn(() => Date.now()),
};

/**
 * SQLite has no native JSON type. We store as TEXT and auto-parse on read /
 * auto-stringify on write via a drizzle customType so callers never see raw
 * strings — they always get the typed value directly.
 */
function jsonColumn<T>(name: string) {
  return customType<{ data: T | null; driverData: string | null }>({
    dataType() { return 'text'; },
    fromDriver(value) {
      if (value === null || value === undefined) return null;
      if (typeof value !== 'string') return value as unknown as T;
      try { return JSON.parse(value) as T; } catch { return null; }
    },
    toDriver(value) {
      if (value === null || value === undefined) return null;
      return JSON.stringify(value);
    },
  })(name);
}

// ── Tables ────────────────────────────────────────────────────────────────────

/**
 * Singleton settings row for this deployment's restaurant.
 * `id` is fixed to 1 so queries are always `WHERE id = 1`. The CHECK constraint
 * enforces the singleton invariant at the DB level.
 */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull().default('My Restaurant'),
  payoff: text('payoff'),
  theme: jsonColumn<Record<string, unknown> | null>('theme'),
  info: jsonColumn<Record<string, unknown> | null>('info'),
  socials: jsonColumn<Record<string, unknown> | null>('socials'),
  openingSchedule: jsonColumn<Record<string, unknown> | null>('opening_schedule'),
  promotionAlert: jsonColumn<Record<string, unknown> | null>('promotion_alert'),
  chatAgentPrompt: text('chat_agent_prompt'),
  aiChatEnabled: integer('ai_chat_enabled', { mode: 'boolean' }).default(false).notNull(),
  aiVoiceEnabled: integer('ai_voice_enabled', { mode: 'boolean' }).default(false).notNull(),
  selectionEnabled: integer('selection_enabled', { mode: 'boolean' }).default(false).notNull(),
  modules: jsonColumn<Record<string, unknown> | null>('modules'),
  primaryLocale: text('primary_locale').default('it').notNull(),
  enabledLocales: jsonColumn<string[] | null>('enabled_locales'),
  disabledLocales: jsonColumn<string[] | null>('disabled_locales'),
  customLocales: jsonColumn<{ code: string; name: string; flagUrl?: string | null }[] | null>('custom_locales'),
  publicationState: text('publication_state').default('draft').notNull(),
  ...timestamps,
});

export const menus = sqliteTable(
  'menus',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull(),
    title: text('title').notNull(),
    i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
    published: integer('published', { mode: 'boolean' }).default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    icon: text('icon').default('utensils').notNull(),
    availableFrom: text('available_from'),
    availableTo: text('available_to'),
    availableDays: jsonColumn<string[] | null>('available_days'),
    ...timestamps,
  },
  (table) => ({
    codeIdx: uniqueIndex('menus_code_idx').on(table.code),
    sortIdx: index('menus_sort_idx').on(table.sortOrder),
  }),
);

export const menuCategories = sqliteTable(
  'menu_categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
    ...timestamps,
  },
  (table) => ({
    sortOrderIdx: index('menu_categories_sort_order_idx').on(table.sortOrder),
  }),
);

export const menuEntries = sqliteTable(
  'menu_entries',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    internalCode: text('internal_code'),
    // Prices stored as integer cents (€12.50 → 1250) to avoid IEEE 754 float drift.
    // Divide by 100 when returning to API clients.
    price: integer('price').notNull(),
    priceUnit: text('price_unit'),
    imageUrl: text('image_url'),
    outOfStock: integer('out_of_stock', { mode: 'boolean' }).default(false).notNull(),
    frozen: integer('frozen', { mode: 'boolean' }).default(false).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).default(false).notNull(),
    allergens: jsonColumn<string[] | null>('allergens'),
    i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
    metadata: jsonColumn<Record<string, unknown> | null>('metadata'),
    ...timestamps,
  },
  (table) => ({
    categoryOrderIdx: index('menu_entries_category_order_idx').on(table.categoryId, table.sortOrder),
  }),
);

export const menuEntryMemberships = sqliteTable(
  'menu_entry_memberships',
  {
    menuId: text('menu_id')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
    entryId: text('entry_id')
      .notNull()
      .references(() => menuEntries.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.menuId, table.entryId] }),
    entryIdx: index('menu_entry_memberships_entry_idx').on(table.entryId),
  }),
);

export const menuVariants = sqliteTable('menu_variants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0).notNull(),
  // selections may contain price deltas — stored as cents integers in JSON
  selections: jsonColumn<Record<string, unknown>[] | null>('selections'),
  i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
  ...timestamps,
});

export const menuExtras = sqliteTable('menu_extras', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').default('zeroorone').notNull(),
  max: integer('max').default(1).notNull(),
  // options may contain price deltas — stored as cents integers in JSON
  options: jsonColumn<Record<string, unknown>[] | null>('options'),
  i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
  ...timestamps,
});

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    /** Email of the admin who took the action (from Cloudflare Access JWT) — free-form text, no FK. */
    actorUid: text('actor_uid'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    payload: jsonColumn<Record<string, unknown> | null>('payload'),
    ...timestamps,
  },
  (table) => ({
    createdIdx: index('audit_events_created_idx').on(table.createdAt),
  }),
);

/**
 * Privacy-safe menu item view tracking.
 * session_hash = SHA-256(IP + YYYYMMDD) — no IP stored, no PII, daily rotation.
 * date_bucket  = YYYYMMDD integer (e.g. 20260413) for efficient daily aggregation.
 * UNIQUE constraint ensures one view per (entry, day, session) — INSERT OR IGNORE deduplicates.
 */
export const catalogViews = sqliteTable(
  'catalog_views',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').references(() => menuEntries.id, { onDelete: 'cascade' }),
    // YYYYMMDD integer for daily aggregation (e.g. 20260413)
    dateBucket: integer('date_bucket').notNull(),
    // SHA-256(IP + dateBucket) — anonymous daily session identifier, no PII
    sessionHash: text('session_hash').notNull(),
    viewedAt: integer('viewed_at').notNull().$defaultFn(() => Date.now()),
  },
  (table) => ({
    // Primary dedup constraint: one view per session per item per day
    uniqueViewIdx: uniqueIndex('catalog_views_unique_idx').on(
      table.entryId,
      table.dateBucket,
      table.sessionHash,
    ),
    // For analytics queries: list views by day
    dateIdx: index('catalog_views_date_idx').on(table.dateBucket),
    // For rolling-window analytics queries (24h, 7d, 30d) that filter by viewedAt
    viewedAtIdx: index('catalog_views_viewed_at_idx').on(table.viewedAt),
  }),
);

// ── Labels ────────────────────────────────────────────────────────────────────

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('primary'),
  sortOrder: integer('sort_order').notNull().default(0),
  i18n: jsonColumn<Record<string, unknown> | null>('i18n'),
  ...timestamps,
});

export const entryLabels = sqliteTable(
  'entry_labels',
  {
    entryId: text('entry_id').notNull().references(() => menuEntries.id, { onDelete: 'cascade' }),
    labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.entryId, table.labelId] }),
    labelIdx: index('entry_labels_label_idx').on(table.labelId),
  }),
);

// ── Chat Sessions ─────────────────────────────────────────────────────────────

/**
 * One row per AI chat session.
 * uid is an anonymous diner session id (HMAC-derived in the chat worker) — pseudonymous, enables erasure.
 * messages stores the full conversation as JSON: [{role, content}, …].
 * tool_calls stores only the tool names used (no params) for analytics.
 */
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    // Anonymous diner session id — pseudonymous, free-form text, no FK.
    uid: text('uid').notNull(),
    // Full conversation: [{role:'user'|'assistant', content:string}, …]
    messages: text('messages').notNull(),
    locale: text('locale').notNull().default('en'),
    // Tool call names used in this session, e.g. ["show_items","get_item_detail"]
    toolCalls: text('tool_calls').notNull().default('[]'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: integer('created_at').notNull().$defaultFn(() => Date.now()),
  },
  (table) => ({
    createdIdx: index('chat_sessions_created_idx').on(table.createdAt),
    uidIdx: index('chat_sessions_uid_idx').on(table.uid),
  }),
);
