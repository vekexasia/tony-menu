import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, seedCategory, seedEntry, seedMembership, signTestJwt, installJwksMock } from './helpers/db';

type CatalogBody = {
  restaurant: { name: string; features?: { aiChat?: boolean; aiVoice?: boolean; analytics?: boolean; ordering?: { enabled: boolean; mode: string } } };
  menus: Array<{ id: string; code: string; title: string; published: boolean }>;
  categories: Array<{ id: string; entries: Array<{ name: string; price: number; menuIds: string[]; hidden: boolean }> }>;
};

beforeAll(() => installJwksMock());

describe('GET /catalog', () => {
  it('returns 503 when DB is not configured', async () => {
    const res = await testRequest('/catalog');
    expect(res.status).toBe(503);
  });

  it('returns 404 when the menu is in draft state', async () => {
    const db = createTestDb();
    seedSettings(db, { publication_state: 'draft' });
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    expect(res.status).toBe(404);
  });

  it('returns the catalog when published', async () => {
    const db = createTestDb();
    seedSettings(db, { name: 'Trattoria Test', publication_state: 'published' });
    seedMenu(db, 'menu-1', 'food');
    seedCategory(db, 'cat-1', 'Antipasti');
    seedEntry(db, 'entry-1', 'cat-1', { name: 'Bruschetta', price: 850 });
    seedMembership(db, 'menu-1', 'entry-1');
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    expect(res.status).toBe(200);
    const body = await res.json() as CatalogBody;
    expect(body.restaurant.name).toBe('Trattoria Test');
    expect(body.restaurant.features?.ordering).toEqual({ enabled: false, mode: 'summary' });
    expect(body.menus).toHaveLength(1);
    expect(body.menus[0].code).toBe('food');
    expect(body.menus[0].published).toBe(true);
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].entries[0].name).toBe('Bruschetta');
    expect(body.categories[0].entries[0].price).toBeCloseTo(8.5);
    expect(body.categories[0].entries[0].menuIds).toEqual(['menu-1']);
  });

  it('hides hidden entries from public catalog', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'visible', 'cat-1', { name: 'Visible' });
    seedEntry(db, 'hidden', 'cat-1', { name: 'Hidden', hidden: true });
    seedMembership(db, 'menu-1', 'visible');
    seedMembership(db, 'menu-1', 'hidden');
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    const body = await res.json() as CatalogBody;
    const names = body.categories[0].entries.map(e => e.name);
    expect(names).toEqual(['Visible']);
  });

  it('hides unpublished menus from public catalog', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-pub', 'food', undefined, { published: true });
    seedMenu(db, 'menu-draft', 'lunch', undefined, { published: false });
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    const body = await res.json() as CatalogBody;
    expect(body.menus.map(m => m.code)).toEqual(['food']);
  });

  it('surfaces the per-menu icon in the catalog response', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-food', 'food');
    seedMenu(db, 'menu-drinks', 'drinks');
    db.raw.prepare("UPDATE menus SET icon = 'wine' WHERE id = ?").run('menu-drinks');
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    const body = await res.json() as CatalogBody;
    const food = body.menus.find(m => m.code === 'food');
    const drinks = body.menus.find(m => m.code === 'drinks');
    // food kept the schema default 'utensils', drinks was overridden to 'wine'.
    expect((food as unknown as { icon: string }).icon).toBe('utensils');
    expect((drinks as unknown as { icon: string }).icon).toBe('wine');
  });

  it('exposes membership across multiple menus per entry', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-a', 'food');
    seedMenu(db, 'menu-b', 'lunch');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-multi', 'cat-1', { name: 'Tiramisu' });
    seedMembership(db, 'menu-a', 'entry-multi');
    seedMembership(db, 'menu-b', 'entry-multi');
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    const body = await res.json() as CatalogBody;
    const entry = body.categories[0].entries.find(e => e.name === 'Tiramisu')!;
    expect(entry.menuIds.sort()).toEqual(['menu-a', 'menu-b']);
  });
});

describe('module feature flags', () => {
  it('surfaces ordering config in the catalog response', async () => {
    const db = createTestDb();
    seedSettings(db, { modules: JSON.stringify({ ordering: { enabled: true, mode: 'summary' } }) });
    const res = await testRequest('/catalog', { env: makeDbEnv(db) });
    expect(res.status).toBe(200);
    const body = await res.json() as CatalogBody;
    expect(body.restaurant.features?.ordering).toEqual({ enabled: true, mode: 'summary' });
    expect(body.restaurant.features).not.toHaveProperty('selection');
  });

  it('surfaces voice dictation only when Tony chat is enabled too', async () => {
    const db = createTestDb();
    seedSettings(db, { modules: JSON.stringify({ ai: { enabled: false, voiceEnabled: true } }) });
    let res = await testRequest('/catalog', { env: makeDbEnv(db) });
    let body = await res.json() as CatalogBody;
    expect(body.restaurant.features?.aiChat).toBe(false);
    expect(body.restaurant.features?.aiVoice).toBe(false);

    seedSettings(db, { modules: JSON.stringify({ ai: { enabled: true, voiceEnabled: true } }) });
    res = await testRequest('/catalog', { env: makeDbEnv(db) });
    body = await res.json() as CatalogBody;
    expect(body.restaurant.features?.aiChat).toBe(true);
    expect(body.restaurant.features?.aiVoice).toBe(true);
  });
});

describe('POST /catalog/view', () => {
  it('records a view for a real entry', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const res = await testRequest('/catalog/view', {
      method: 'POST',
      body: { entryId: 'entry-1' },
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(200);
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('returns 404 without recording views when analytics is disabled', async () => {
    const db = createTestDb();
    seedSettings(db, { modules: JSON.stringify({ analytics: { enabled: false } }) });
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const res = await testRequest('/catalog/view', {
      method: 'POST',
      body: { entryId: 'entry-1' },
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(404);
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('silently drops views for unknown entries (no row inserted)', async () => {
    const db = createTestDb();
    seedSettings(db);
    const res = await testRequest('/catalog/view', {
      method: 'POST',
      body: { entryId: 'does-not-exist' },
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(200);
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('deduplicates same session/day/entry via UNIQUE constraint', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const env = makeDbEnv(db);
    const send = () => testRequest('/catalog/view', {
      method: 'POST',
      body: { entryId: 'entry-1' },
      headers: { 'cf-connecting-ip': '1.2.3.4' },
      env,
    });
    await send();
    await send();
    await send();
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('different IPs produce different rows on the same day', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const env = makeDbEnv(db);
    await testRequest('/catalog/view', {
      method: 'POST', body: { entryId: 'entry-1' },
      headers: { 'cf-connecting-ip': '1.1.1.1' }, env,
    });
    await testRequest('/catalog/view', {
      method: 'POST', body: { entryId: 'entry-1' },
      headers: { 'cf-connecting-ip': '2.2.2.2' }, env,
    });
    const count = db.raw.prepare('SELECT COUNT(*) AS n FROM catalog_views').get() as { n: number };
    expect(count.n).toBe(2);
  });
});

describe('POST /catalog/publish', () => {
  it('returns 401 without auth', async () => {
    const db = createTestDb();
    seedSettings(db);
    const res = await testRequest('/catalog/publish', {
      method: 'POST',
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const db = createTestDb();
    seedSettings(db);
    const token = await signTestJwt('not-admin');
    const res = await testRequest('/catalog/publish', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': token },
      env: makeDbEnv(db, { ADMIN_EMAILS: 'admin-1' }),
    });
    expect(res.status).toBe(403);
  });

  it('regenerates artifacts for an admin', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const token = await signTestJwt('admin-1');
    const res = await testRequest('/catalog/publish', {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': token },
      env: makeDbEnv(db, { ADMIN_EMAILS: 'admin-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
