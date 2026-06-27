import type { Env } from '../types';
import {
  now,
  settings,
  menus,
  categories,
  entries,
  variants,
  extras,
  drinkCategoryIds,
  FOOD_MENU_ID,
  DRINKS_MENU_ID,
} from './demo-seed-data';

export async function resetDemoData(env: Env): Promise<void> {
  if (!env.DB) throw new Error('Database not configured');

  const statements: D1PreparedStatement[] = [
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

  await env.DB.batch(statements);
  await deleteR2Prefix(env.PUBLIC_MENU_BUCKET, 'images/');
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
