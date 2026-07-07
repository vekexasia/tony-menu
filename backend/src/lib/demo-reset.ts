import type { Env } from '../types';
import {
  now,
  settings,
  menus,
  categories,
  entries,
  variants,
  extras,
  orderDestinations,
  entryDestinations,
  tables,
  areas,
  demoStaffLinks,
  drinkCategoryIds,
  CUCINA_ID,
  BAR_ID,
  FOOD_MENU_ID,
  DRINKS_MENU_ID,
} from './demo-seed-data';

export async function resetDemoData(env: Env): Promise<void> {
  if (!env.DB) throw new Error('Database not configured');

  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM order_events'),
    env.DB.prepare('DELETE FROM order_item_destinations'),
    env.DB.prepare('DELETE FROM order_items'),
    env.DB.prepare('DELETE FROM orders'),
    env.DB.prepare('DELETE FROM order_intents'),
    env.DB.prepare('DELETE FROM table_sessions'),
    env.DB.prepare('DELETE FROM staff_links'),
    env.DB.prepare('DELETE FROM tables'),
    env.DB.prepare('DELETE FROM areas'),
    env.DB.prepare('DELETE FROM entry_destinations'),
    env.DB.prepare('DELETE FROM order_destinations'),
    env.DB.prepare('DELETE FROM catalog_views'),
    env.DB.prepare('DELETE FROM chat_sessions'),
    env.DB.prepare('DELETE FROM audit_events'),
    env.DB.prepare('DELETE FROM entry_labels'),
    env.DB.prepare('DELETE FROM labels'),
    env.DB.prepare('DELETE FROM menu_entry_memberships'),
    env.DB.prepare('DELETE FROM menu_entries'),
    env.DB.prepare('DELETE FROM menu_categories'),
    env.DB.prepare('DELETE FROM menus'),
    env.DB.prepare('DELETE FROM menu_variants'),
    env.DB.prepare('DELETE FROM menu_extras'),
    env.DB.prepare(`UPDATE settings SET name = ?, payoff = ?, theme = ?, info = ?, socials = ?, opening_schedule = ?, promotion_alert = ?, chat_agent_prompt = ?, ai_chat_enabled = ?, ai_voice_enabled = ?, primary_locale = ?, enabled_locales = ?, disabled_locales = ?, custom_locales = ?, publication_state = ?, updated_at = ? WHERE id = 1`).bind(
      settings.name,
      settings.payoff,
      JSON.stringify(settings.theme),
      JSON.stringify(settings.info),
      JSON.stringify(settings.socials),
      JSON.stringify(settings.openingSchedule),
      JSON.stringify(settings.promotionAlert),
      settings.chatAgentPrompt,
      settings.aiChatEnabled ? 1 : 0,
      settings.aiVoiceEnabled ? 1 : 0,
      settings.primaryLocale,
      JSON.stringify(settings.enabledLocales),
      JSON.stringify(settings.disabledLocales),
      JSON.stringify(settings.customLocales),
      settings.publicationState,
      Date.now(),
    ),
  ];

  for (const menu of menus) {
    statements.push(env.DB.prepare('INSERT INTO menus (id, code, title, i18n, published, sort_order, icon, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)').bind(menu.id, menu.code, menu.title, JSON.stringify(menu.i18n), menu.sortOrder, menu.icon, now, now));
  }
  for (const category of categories) {
    statements.push(env.DB.prepare('INSERT INTO menu_categories (id, name, sort_order, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(category.id, category.name, category.sortOrder, JSON.stringify(category.i18n), now, now));
  }
  for (const entry of entries) {
    statements.push(env.DB.prepare('INSERT INTO menu_entries (id, category_id, name, description, price, image_url, sort_order, hidden, allergens, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)').bind(entry.id, entry.categoryId, entry.name, entry.description, entry.price, entry.imageUrl, entry.sortOrder, JSON.stringify(entry.allergens), JSON.stringify(entry.i18n), now, now));
    const menuId = drinkCategoryIds.has(entry.categoryId) ? DRINKS_MENU_ID : FOOD_MENU_ID;
    statements.push(env.DB.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').bind(menuId, entry.id));
  }
  for (const variant of variants) {
    statements.push(env.DB.prepare('INSERT INTO menu_variants (id, name, description, sort_order, selections, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(variant.id, variant.name, variant.description, variant.sortOrder, JSON.stringify(variant.selections), JSON.stringify(variant.i18n), now, now));
  }
  for (const extra of extras) {
    statements.push(env.DB.prepare('INSERT INTO menu_extras (id, name, type, max, options, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(extra.id, extra.name, extra.type, extra.max, JSON.stringify(extra.options), JSON.stringify(extra.i18n), now, now));
  }
  for (const dest of orderDestinations) {
    statements.push(env.DB.prepare('INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(dest.id, dest.name, dest.sortOrder, now, now));
  }
  for (const ed of entryDestinations) {
    statements.push(env.DB.prepare('INSERT INTO entry_destinations (entry_id, destination_id) VALUES (?, ?)').bind(ed.entryId, ed.destinationId));
  }
  for (const area of areas) {
    statements.push(env.DB.prepare('INSERT INTO areas (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(area.id, area.name, area.sortOrder, now, now));
  }
  for (const table of tables) {
    statements.push(env.DB.prepare('INSERT INTO tables (id, name, active, sort_order, area_id, x, y, shape, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)').bind(table.id, table.name, table.sortOrder, table.areaId, table.x, table.y, table.shape, now, now));
  }
  for (const staff of demoStaffLinks) {
    statements.push(env.DB.prepare('INSERT INTO staff_links (id, name, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(staff.id, staff.name, staff.token, now, now));
  }

  const demoLabels = [
    {
      id: 'demo-label-chef',
      name: "Lo Chef consiglia",
      color: 'red',
      sortOrder: 0,
      i18n: { en: { name: "Chef's pick" }, it: { name: 'Lo Chef consiglia' }, de: { name: 'Chef empfiehlt' }, fr: { name: 'Le Chef recommande' } },
      entryIds: ['demo-entry-polpo', 'demo-entry-tagliata'],
    },
    {
      id: 'demo-label-veg',
      name: 'Vegetariano',
      color: 'green',
      sortOrder: 1,
      i18n: { en: { name: 'Vegetarian' }, it: { name: 'Vegetariano' }, de: { name: 'Vegetarisch' }, fr: { name: 'Végétarien' } },
      entryIds: ['demo-entry-carpaccio', 'demo-entry-ravioli'],
    },
  ];
  for (const label of demoLabels) {
    statements.push(env.DB.prepare('INSERT INTO labels (id, name, color, sort_order, i18n, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(label.id, label.name, label.color, label.sortOrder, JSON.stringify(label.i18n), now, now));
    for (const entryId of label.entryIds) {
      statements.push(env.DB.prepare('INSERT INTO entry_labels (entry_id, label_id) VALUES (?, ?)').bind(entryId, label.id));
    }
  }

  // E2E asserts a clean floor after each reset (order #1, gray tiles), so the
  // showcase (a live table + settled-check history) is seeded only outside E2E.
  if (env.E2E_MODE !== 'true') seedShowcase(env, statements);

  await env.DB.batch(statements);
  await deleteR2Prefix(env.PUBLIC_MENU_BUCKET, 'images/');
}

// Owner-facing showcase (#15): one live table with active orders + a history of
// settled checks on the other tables, so a fresh demo never shows an empty floor.
// Appends statements to the same reset batch. Deterministic (index-based, no
// randomness): IDs are stable so reruns after a reset land identically.
function seedShowcase(env: Env, statements: D1PreparedStatement[]): void {
  const db = env.DB!;
  const MIN = 60_000;
  const DAY = 86_400_000;
  const nowMs = Date.now();
  // YYYYMMDD bucket mirrors currentOrderDay() in routes/orders.ts.
  const dayOf = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: env.ORDER_TIME_ZONE || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
    return value('year') * 10000 + value('month') * 100 + value('day');
  };
  const destOf = (e: (typeof entries)[number]) =>
    drinkCategoryIds.has(e.categoryId) ? { id: BAR_ID, name: 'Bar' } : { id: CUCINA_ID, name: 'Cucina' };
  const item = (e: (typeof entries)[number], quantity: number) => {
    const d = destOf(e);
    return { entryId: e.id, name: e.name, price: e.price, quantity, destId: d.id, destName: d.name };
  };
  const suffix = (tableId: string) => tableId.replace('demo-table-', '');

  type Item = ReturnType<typeof item>;
  type Event = { status: string; actor: string; actorName: string | null; createdAt: number };
  const sessions: { id: string; tableId: string; openedAt: number; closedAt: number | null }[] = [];
  const orders: {
    id: string; tableSessionId: string; orderDay: number; createdAt: number; updatedAt: number;
    status: string; idempotencyKey: string; dailyNumber?: number; items: Item[]; events: Event[];
  }[] = [];
  const checkRows: {
    id: string; tableSessionId: string; createdAt: number; settledAt: number;
    lines: { name: string; quantity: number; unitPrice: number }[];
    discount: { type: 'percent'; value: number } | null;
  }[] = [];

  // A. LIVE TABLE — sala-2 open 25min, two active orders by Marco.
  const byId = (id: string) => entries.find((e) => e.id === id)!;
  sessions.push({ id: 'demo-session-sala-2-live', tableId: 'demo-table-sala-2', openedAt: nowMs - 25 * MIN, closedAt: null });
  orders.push({
    id: 'demo-order-sala-2-1', tableSessionId: 'demo-session-sala-2-live',
    orderDay: dayOf(nowMs - 20 * MIN), createdAt: nowMs - 20 * MIN, updatedAt: nowMs - 20 * MIN,
    status: 'submitted', idempotencyKey: 'demo-ik-sala-2-1',
    items: [item(byId('demo-entry-bruschetta'), 2), item(byId('demo-entry-prosecco'), 2)],
    events: [{ status: 'submitted', actor: 'staff', actorName: 'Marco Demo', createdAt: nowMs - 20 * MIN }],
  });
  orders.push({
    id: 'demo-order-sala-2-2', tableSessionId: 'demo-session-sala-2-live',
    orderDay: dayOf(nowMs - 8 * MIN), createdAt: nowMs - 8 * MIN, updatedAt: nowMs - 3 * MIN,
    status: 'ready', idempotencyKey: 'demo-ik-sala-2-2',
    items: [item(byId('demo-entry-ravioli'), 1)],
    events: [
      { status: 'submitted', actor: 'staff', actorName: 'Marco Demo', createdAt: nowMs - 8 * MIN },
      { status: 'ready', actor: 'admin', actorName: null, createdAt: nowMs - 3 * MIN },
    ],
  });

  // B. HISTORY — every other table gets 4 closed sessions with a settled check,
  // spread over the past 1..8 days (never today, so daily numbering can't clash).
  const historyTables = tables;
  let g = 0;
  historyTables.forEach((t, ti) => {
    for (let s = 1; s <= 4; s++) {
      const daysAgo = ((s + ti) % 8) + 1;
      const opened = nowMs - daysAgo * DAY;
      const closed = opened + 90 * MIN;
      const orderCreated = opened + 5 * MIN;
      const served = closed - 30 * MIN;
      const sessionId = `demo-session-${suffix(t.id)}-${s}`;
      const orderId = `demo-order-hist-${suffix(t.id)}-${s}`;
      const waiter = g % 2 === 0 ? 'Marco Demo' : 'Giulia Demo';
      const items: Item[] = [];
      for (let i = 0; i < (g % 3) + 1; i++) items.push(item(entries[(g + i) % entries.length], (i % 2) + 1));
      sessions.push({ id: sessionId, tableId: t.id, openedAt: opened, closedAt: closed });
      orders.push({
        id: orderId, tableSessionId: sessionId,
        orderDay: dayOf(orderCreated), createdAt: orderCreated, updatedAt: served,
        status: 'served', idempotencyKey: `demo-ik-hist-${suffix(t.id)}-${s}`,
        items,
        events: [
          { status: 'submitted', actor: 'staff', actorName: waiter, createdAt: orderCreated },
          { status: 'served', actor: 'staff', actorName: waiter, createdAt: served },
        ],
      });
      checkRows.push({
        id: `demo-check-${suffix(t.id)}-${s}`, tableSessionId: sessionId,
        createdAt: closed - 5 * MIN, settledAt: closed,
        lines: items.map((it) => ({ name: it.name, quantity: it.quantity, unitPrice: it.price })),
        discount: g % 4 === 0 ? { type: 'percent', value: 10 } : null,
      });
      g++;
    }
  });

  // Daily numbering: number 1..n per UTC day in creation order (COUNT(*)+1 at
  // submit time). Live orders own today; each past day is numbered independently.
  const byDay = new Map<number, number>();
  for (const o of [...orders].sort((a, b) => a.createdAt - b.createdAt)) {
    const n = (byDay.get(o.orderDay) ?? 0) + 1;
    byDay.set(o.orderDay, n);
    o.dailyNumber = n;
  }

  for (const se of sessions) {
    statements.push(db.prepare('INSERT INTO table_sessions (id, table_id, opened_at, closed_at) VALUES (?, ?, ?, ?)').bind(se.id, se.tableId, se.openedAt, se.closedAt));
  }
  for (const o of orders) {
    statements.push(db.prepare('INSERT INTO orders (id, order_day, daily_number, status, idempotency_key, table_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(o.id, o.orderDay, o.dailyNumber!, o.status, o.idempotencyKey, o.tableSessionId, o.createdAt, o.updatedAt));
    o.items.forEach((it, idx) => {
      const itemId = `${o.id}-i${idx}`;
      statements.push(db.prepare('INSERT INTO order_items (id, order_id, entry_id, name, price, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(itemId, o.id, it.entryId, it.name, it.price, it.quantity, o.createdAt));
      statements.push(db.prepare('INSERT INTO order_item_destinations (id, order_item_id, destination_id, destination_name, created_at) VALUES (?, ?, ?, ?, ?)').bind(`${itemId}-d`, itemId, it.destId, it.destName, o.createdAt));
    });
    o.events.forEach((ev, idx) => {
      statements.push(db.prepare('INSERT INTO order_events (id, order_id, status, actor, actor_name, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(`${o.id}-e${idx}`, o.id, ev.status, ev.actor, ev.actorName, ev.createdAt));
    });
  }
  for (const ch of checkRows) {
    statements.push(db.prepare('INSERT INTO checks (id, table_session_id, status, lines, discount, adjustments, created_at, settled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(ch.id, ch.tableSessionId, 'settled', JSON.stringify(ch.lines), ch.discount ? JSON.stringify(ch.discount) : null, JSON.stringify([]), ch.createdAt, ch.settledAt));
  }
}

async function deleteR2Prefix(bucket: R2Bucket | undefined, prefix: string): Promise<void> {
  if (!bucket) return;

  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    await Promise.all(listed.objects.map((object) => bucket.delete(object.key)));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}
