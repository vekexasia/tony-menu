import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, seedCategory, seedEntry, signTestJwt, installJwksMock } from './helpers/db';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';
type SettingsRow = { name: string; payoff: string; ai_chat_enabled: number; selection_enabled: number };
type PublicationRow = { publication_state: string };
type CategoryRow = { name: string };
type EntryRow = { name: string; price: number; hidden: number; out_of_stock: number; category_id: string };


async function adminEnv(db = createTestDb()) {
  seedSettings(db);
  const env = makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
  const token = await signTestJwt(ADMIN_UID);
  return {
    db,
    env,
    headers: { 'Cf-Access-Jwt-Assertion': token },
  };
}

describe('GET /admin/settings', () => {
  it('returns settings for an admin', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/settings', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as { publicationState: string; aiChatEnabled: boolean; selectionEnabled: boolean };
    expect(body).toHaveProperty('publicationState');
    expect(body).toHaveProperty('aiChatEnabled');
    expect(body.selectionEnabled).toBe(false);
  });
});

describe('PUT /admin/settings', () => {
  it('updates settings fields and persists them', async () => {
    const { db, env, headers } = await adminEnv();
    const res = await testRequest('/admin/settings', {
      method: 'PUT',
      headers,
      env,
      body: { name: 'Trattoria Nuova', payoff: 'Il sapore di casa', aiChatEnabled: true, selectionEnabled: true },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT name, payoff, ai_chat_enabled, selection_enabled FROM settings WHERE id = 1').get() as SettingsRow;
    expect(row.name).toBe('Trattoria Nuova');
    expect(row.payoff).toBe('Il sapore di casa');
    expect(row.ai_chat_enabled).toBe(1);
    expect(row.selection_enabled).toBe(1);
  });
});

describe('PUT /admin/publication', () => {
  it('toggles publication state', async () => {
    const { db, env, headers } = await adminEnv();
    let res = await testRequest('/admin/publication', {
      method: 'PUT', headers, env, body: { published: true },
    });
    expect(res.status).toBe(200);
    let row = db.raw.prepare('SELECT publication_state FROM settings WHERE id = 1').get() as PublicationRow;
    expect(row.publication_state).toBe('published');

    res = await testRequest('/admin/publication', {
      method: 'PUT', headers, env, body: { published: false },
    });
    expect(res.status).toBe(200);
    row = db.raw.prepare('SELECT publication_state FROM settings WHERE id = 1').get() as PublicationRow;
    expect(row.publication_state).toBe('draft');
  });
});

describe('PUT /admin/categories/:id', () => {
  it('updates a category name', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1', 'Old Name');
    const res = await testRequest('/admin/categories/cat-1', {
      method: 'PUT', headers, env, body: { name: 'New Name' },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT name FROM menu_categories WHERE id = ?').get('cat-1') as CategoryRow;
    expect(row.name).toBe('New Name');
  });
});

describe('DELETE /admin/categories/:id', () => {
  it('cascades to entries and catalog views', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    db.raw.prepare(
      `INSERT INTO catalog_views (id, entry_id, date_bucket, session_hash, viewed_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('view-1', 'entry-1', 20260429, 'hash', Date.now());

    const res = await testRequest('/admin/categories/cat-1', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);

    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menu_categories').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menu_entries').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get()).toEqual({ n: 0 });
  });
});

describe('PATCH /admin/categories/reorder', () => {
  it('updates sort_order on each provided id', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1', 'A', 0);
    seedCategory(db, 'cat-2', 'B', 1);
    seedCategory(db, 'cat-3', 'C', 2);

    const res = await testRequest('/admin/categories/reorder', {
      method: 'PATCH', headers, env,
      body: { items: [{ id: 'cat-3', order: 0 }, { id: 'cat-1', order: 1 }, { id: 'cat-2', order: 2 }] },
    });
    expect(res.status).toBe(200);

    const orders = db.raw.prepare('SELECT id, sort_order FROM menu_categories ORDER BY sort_order').all();
    expect(orders).toEqual([
      { id: 'cat-3', sort_order: 0 },
      { id: 'cat-1', sort_order: 1 },
      { id: 'cat-2', sort_order: 2 },
    ]);
  });
});

describe('POST /admin/categories/:id/entries', () => {
  it('creates an entry under the category and converts price to cents', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');

    const res = await testRequest('/admin/categories/cat-1/entries', {
      method: 'POST', headers, env,
      body: { name: 'Pizza Margherita', price: 9.5, menuIds: ['menu-1'] },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toBeDefined();

    const row = db.raw.prepare('SELECT name, price, hidden FROM menu_entries WHERE id = ?').get(body.id) as Pick<EntryRow, 'name' | 'price' | 'hidden'>;
    expect(row.name).toBe('Pizza Margherita');
    expect(row.price).toBe(950);
    expect(row.hidden).toBe(0);

    const memberships = db.raw.prepare('SELECT menu_id FROM menu_entry_memberships WHERE entry_id = ?').all(body.id);
    expect(memberships).toEqual([{ menu_id: 'menu-1' }]);
  });

  it('returns 404 if the category does not exist', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/categories/nope/entries', {
      method: 'POST', headers, env,
      body: { name: 'X', price: 1, menuIds: [] },
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /admin/entries/:id', () => {
  it('updates the named fields', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1', { name: 'Old', price: 500 });

    const res = await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { name: 'New', price: 12.34, outOfStock: true },
    });
    expect(res.status).toBe(200);

    const row = db.raw.prepare('SELECT name, price, out_of_stock FROM menu_entries WHERE id = ?').get('entry-1') as Pick<EntryRow, 'name' | 'price' | 'out_of_stock'>;
    expect(row.name).toBe('New');
    expect(row.price).toBe(1234);
    expect(row.out_of_stock).toBe(1);
  });
});

describe('DELETE /admin/entries/:id', () => {
  it('removes the entry', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const res = await testRequest('/admin/entries/entry-1', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menu_entries').get()).toEqual({ n: 0 });
  });
});

describe('Menus CRUD', () => {
  it('GET /admin/menus returns ordered menus with metadata', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-2', 'drinks', 'Drinks', { sortOrder: 1 });
    seedMenu(db, 'm-1', 'food', 'Food', { sortOrder: 0 });
    const res = await testRequest('/admin/menus', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as { menus: Array<{ id: string; code: string; sortOrder: number; published: boolean }> };
    expect(body.menus.map(m => m.code)).toEqual(['food', 'drinks']);
    expect(body.menus.every(m => m.published)).toBe(true);
  });

  it('POST /admin/menus creates with auto sort_order, validates code', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food', 'Food', { sortOrder: 0 });

    const ok = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'lunch', title: 'Lunch' },
    });
    expect(ok.status).toBe(201);
    const created = await ok.json() as { id: string };

    const row = db.raw.prepare('SELECT code, title, sort_order, published FROM menus WHERE id = ?').get(created.id) as { code: string; title: string; sort_order: number; published: number };
    expect(row.code).toBe('lunch');
    expect(row.title).toBe('Lunch');
    expect(row.sort_order).toBe(1);
    expect(row.published).toBe(1);

    // Duplicate code -> 409
    const dup = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'food', title: 'Other' },
    });
    expect(dup.status).toBe(409);

    // Invalid code -> 400
    const bad = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'Has Spaces', title: 'X' },
    });
    expect(bad.status).toBe(400);
  });

  it('PATCH /admin/menus/:id updates fields and rejects duplicate codes', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food');
    seedMenu(db, 'm-2', 'drinks');

    const renamed = await testRequest('/admin/menus/m-1', {
      method: 'PATCH', headers, env,
      body: { title: 'Cucina', published: false },
    });
    expect(renamed.status).toBe(200);
    const row = db.raw.prepare('SELECT title, published FROM menus WHERE id = ?').get('m-1') as { title: string; published: number };
    expect(row.title).toBe('Cucina');
    expect(row.published).toBe(0);

    const collide = await testRequest('/admin/menus/m-1', {
      method: 'PATCH', headers, env, body: { code: 'drinks' },
    });
    expect(collide.status).toBe(409);

    // Same code on same menu is allowed (no-op)
    const same = await testRequest('/admin/menus/m-1', {
      method: 'PATCH', headers, env, body: { code: 'food' },
    });
    expect(same.status).toBe(200);
  });

  it('POST /admin/menus accepts an icon and the catalog surfaces it', async () => {
    const { db, env, headers } = await adminEnv();

    const res = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'lunch', title: 'Pranzo', icon: 'lunch' },
    });
    expect(res.status).toBe(201);
    const created = await res.json() as { id: string };
    const row = db.raw.prepare('SELECT icon FROM menus WHERE id = ?').get(created.id) as { icon: string };
    expect(row.icon).toBe('lunch');
  });

  it('POST /admin/menus defaults icon to "utensils" when omitted', async () => {
    const { db, env, headers } = await adminEnv();

    const res = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'food', title: 'Cibo' },
    });
    expect(res.status).toBe(201);
    const created = await res.json() as { id: string };
    const row = db.raw.prepare('SELECT icon FROM menus WHERE id = ?').get(created.id) as { icon: string };
    expect(row.icon).toBe('utensils');
  });

  it('POST /admin/menus rejects an unknown icon kind with 400', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus', {
      method: 'POST', headers, env,
      body: { code: 'food', title: 'Cibo', icon: 'spaceship' },
    });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/menus/:id can update just the icon', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food', 'Food');
    expect((db.raw.prepare('SELECT icon FROM menus WHERE id = ?').get('m-1') as { icon: string }).icon).toBe('utensils');

    const res = await testRequest('/admin/menus/m-1', {
      method: 'PATCH', headers, env, body: { icon: 'wine' },
    });
    expect(res.status).toBe(200);
    expect((db.raw.prepare('SELECT icon FROM menus WHERE id = ?').get('m-1') as { icon: string }).icon).toBe('wine');
  });

  it('PATCH /admin/menus/:id rejects an unknown icon kind with 400', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food');
    const res = await testRequest('/admin/menus/m-1', {
      method: 'PATCH', headers, env, body: { icon: 'banjo' },
    });
    expect(res.status).toBe(400);
  });

  it('GET /admin/menus surfaces the icon field', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food');
    db.raw.prepare("UPDATE menus SET icon = 'wine' WHERE id = ?").run('m-1');

    const res = await testRequest('/admin/menus', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as { menus: Array<{ id: string; icon: string }> };
    expect(body.menus.find(m => m.id === 'm-1')?.icon).toBe('wine');
  });

  it('PATCH /admin/menus/reorder updates sort_order', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'a', 'food', 'A', { sortOrder: 0 });
    seedMenu(db, 'b', 'drinks', 'B', { sortOrder: 1 });
    seedMenu(db, 'c', 'lunch', 'C', { sortOrder: 2 });

    const res = await testRequest('/admin/menus/reorder', {
      method: 'PATCH', headers, env,
      body: { items: [{ id: 'c', order: 0 }, { id: 'a', order: 1 }, { id: 'b', order: 2 }] },
    });
    expect(res.status).toBe(200);

    const orders = db.raw.prepare('SELECT id, sort_order FROM menus ORDER BY sort_order').all();
    expect(orders).toEqual([
      { id: 'c', sort_order: 0 },
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('DELETE /admin/menus/:id cascades memberships but keeps the entry', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food');
    seedMenu(db, 'm-2', 'drinks');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-1', 'entry-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-2', 'entry-1');

    const res = await testRequest('/admin/menus/m-1', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);

    const remaining = db.raw.prepare('SELECT menu_id FROM menu_entry_memberships WHERE entry_id = ?').all('entry-1');
    expect(remaining).toEqual([{ menu_id: 'm-2' }]);

    // Entry itself survives
    const entry = db.raw.prepare('SELECT id FROM menu_entries WHERE id = ?').get('entry-1');
    expect(entry).toEqual({ id: 'entry-1' });
  });
});

describe('Categories: create + entry membership', () => {
  it('POST /admin/categories creates a flat category', async () => {
    const { db, env, headers } = await adminEnv();
    const res = await testRequest('/admin/categories', {
      method: 'POST', headers, env,
      body: { name: 'Antipasti' },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    const row = db.raw.prepare('SELECT name FROM menu_categories WHERE id = ?').get(body.id) as { name: string };
    expect(row.name).toBe('Antipasti');
  });

  it('PUT /admin/entries/:id replaces membership idempotently', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-a', 'food');
    seedMenu(db, 'm-b', 'drinks');
    seedMenu(db, 'm-c', 'lunch');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-a', 'entry-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-b', 'entry-1');

    const res = await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { menuIds: ['m-c', 'm-a'] },
    });
    expect(res.status).toBe(200);

    const rows = db.raw.prepare('SELECT menu_id FROM menu_entry_memberships WHERE entry_id = ? ORDER BY menu_id').all('entry-1');
    expect(rows).toEqual([{ menu_id: 'm-a' }, { menu_id: 'm-c' }]);
  });

  it('PUT /admin/entries/:id with empty menuIds removes all memberships', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-a', 'food');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-a', 'entry-1');

    const res = await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { menuIds: [] },
    });
    expect(res.status).toBe(200);

    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM menu_entry_memberships WHERE entry_id = ?').get('entry-1') as { n: number };
    expect(count.n).toBe(0);
  });

  it('PUT /admin/entries/:id sets the hidden flag', async () => {
    const { db, env, headers } = await adminEnv();
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const res = await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env, body: { hidden: true },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT hidden FROM menu_entries WHERE id = ?').get('entry-1') as { hidden: number };
    expect(row.hidden).toBe(1);
  });
});

describe('POST /admin/entries/:id/move', () => {
  it('moves an entry to a new category', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedCategory(db, 'cat-2');
    seedEntry(db, 'entry-1', 'cat-1');

    const res = await testRequest('/admin/entries/entry-1/move', {
      method: 'POST', headers, env,
      body: { targetCategoryId: 'cat-2' },
    });
    expect(res.status).toBe(200);

    const row = db.raw.prepare('SELECT category_id FROM menu_entries WHERE id = ?').get('entry-1') as Pick<EntryRow, 'category_id'>;
    expect(row.category_id).toBe('cat-2');
  });

  it('returns 404 if target category does not exist', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const res = await testRequest('/admin/entries/entry-1/move', {
      method: 'POST', headers, env,
      body: { targetCategoryId: 'no-such-cat' },
    });
    expect(res.status).toBe(404);
  });
});
