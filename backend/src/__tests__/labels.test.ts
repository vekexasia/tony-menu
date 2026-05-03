import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import {
  createTestDb,
  makeDbEnv,
  seedSettings,
  seedMenu,
  seedCategory,
  seedEntry,
  signTestJwt,
  installJwksMock,
} from './helpers/db';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-label-tests';

async function setup() {
  const db = createTestDb();
  seedSettings(db);
  const env = makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
  const token = await signTestJwt(ADMIN_UID);
  const headers = { 'Cf-Access-Jwt-Assertion': token };
  return { db, env, headers };
}

// ── CRUD ─────────────────────────────────────────────────────────────

describe('POST /admin/labels', () => {
  it('creates a label and returns id', async () => {
    const { env, headers } = await setup();
    const res = await testRequest('/admin/labels', {
      method: 'POST', headers, env,
      body: { name: 'Vegano', color: 'green' },
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
  });

  it('defaults to primary color when color is omitted', async () => {
    const { db, env, headers } = await setup();
    const res = await testRequest('/admin/labels', {
      method: 'POST', headers, env,
      body: { name: 'NocolorLabel' },
    });
    expect(res.status).toBe(201);
    const { id } = await res.json() as { id: string };
    const row = db.raw.prepare('SELECT color FROM labels WHERE id = ?').get(id) as { color: string };
    expect(row.color).toBe('primary');
  });
});

describe('GET /admin/labels', () => {
  it('returns the labels list in sort order', async () => {
    const { env, headers } = await setup();
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await testRequest('/admin/labels', { method: 'POST', headers, env, body: { name, color: 'amber' } });
    }
    const res = await testRequest('/admin/labels', { headers, env });
    expect(res.status).toBe(200);
    const { labels } = await res.json() as { labels: Array<{ name: string; sortOrder: number }> };
    expect(labels.length).toBe(3);
    expect(labels.map((l) => l.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });
});

describe('PATCH /admin/labels/:id', () => {
  it('updates name and color', async () => {
    const { db, env, headers } = await setup();
    const { id } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'Old', color: 'red' },
    }).then((r) => r.json()) as { id: string };

    const res = await testRequest(`/admin/labels/${id}`, {
      method: 'PATCH', headers, env, body: { name: 'New', color: 'green' },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT name, color FROM labels WHERE id = ?').get(id) as { name: string; color: string };
    expect(row.name).toBe('New');
    expect(row.color).toBe('green');
  });
});

describe('DELETE /admin/labels/:id', () => {
  it('removes the label', async () => {
    const { db, env, headers } = await setup();
    const { id } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'Gone', color: 'gray' },
    }).then((r) => r.json()) as { id: string };

    const res = await testRequest(`/admin/labels/${id}`, { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT id FROM labels WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('cascades: removes entry_labels rows when label is deleted', async () => {
    const { db, env, headers } = await setup();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const { id: labelId } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'ToCascade', color: 'red' },
    }).then((r) => r.json()) as { id: string };

    await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { name: 'Entry', price: 10, labelIds: [labelId] },
    });
    let row = db.raw.prepare('SELECT * FROM entry_labels WHERE label_id = ?').get(labelId);
    expect(row).toBeDefined();

    await testRequest(`/admin/labels/${labelId}`, { method: 'DELETE', headers, env });
    row = db.raw.prepare('SELECT * FROM entry_labels WHERE label_id = ?').get(labelId);
    expect(row).toBeUndefined();
  });
});

// ── Reorder ───────────────────────────────────────────────────────────

describe('PATCH /admin/labels/reorder', () => {
  it('updates sort orders', async () => {
    const { db, env, headers } = await setup();
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      const { id } = await testRequest('/admin/labels', {
        method: 'POST', headers, env, body: { name, color: 'primary' },
      }).then((r) => r.json()) as { id: string };
      ids.push(id);
    }

    const res = await testRequest('/admin/labels/reorder', {
      method: 'PATCH', headers, env,
      body: { items: [{ id: ids[2], order: 0 }, { id: ids[1], order: 1 }, { id: ids[0], order: 2 }] },
    });
    expect(res.status).toBe(200);
    const rows = db.raw.prepare('SELECT id, sort_order FROM labels ORDER BY sort_order').all() as Array<{ id: string; sort_order: number }>;
    expect(rows[0].id).toBe(ids[2]);
    expect(rows[1].id).toBe(ids[1]);
    expect(rows[2].id).toBe(ids[0]);
  });
});

// ── Entry assignment ──────────────────────────────────────────────────

describe('PUT /admin/entries/:id — labelIds', () => {
  it('assigns and unassigns labels', async () => {
    const { db, env, headers } = await setup();
    seedMenu(db, 'menu-1');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const { id: l1 } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'L1', color: 'primary' },
    }).then((r) => r.json()) as { id: string };
    const { id: l2 } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'L2', color: 'green' },
    }).then((r) => r.json()) as { id: string };

    await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { name: 'Entry', price: 10, labelIds: [l1, l2] },
    });
    let rows = db.raw.prepare('SELECT label_id FROM entry_labels WHERE entry_id = ?').all('entry-1') as Array<{ label_id: string }>;
    expect(rows.map((r) => r.label_id).sort()).toEqual([l1, l2].sort());

    await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env,
      body: { name: 'Entry', price: 10, labelIds: [l1] },
    });
    rows = db.raw.prepare('SELECT label_id FROM entry_labels WHERE entry_id = ?').all('entry-1') as Array<{ label_id: string }>;
    expect(rows.map((r) => r.label_id)).toEqual([l1]);
  });
});

// ── Catalog shape ─────────────────────────────────────────────────────

describe('GET /catalog — labels', () => {
  it('includes labels array and entry labelIds', async () => {
    const { db: cdb, env: cenv, headers: cheaders } = await setup();
    seedMenu(cdb, 'menu-1');
    seedCategory(cdb, 'cat-1');
    seedEntry(cdb, 'entry-1', 'cat-1');

    const { id: labelId } = await testRequest('/admin/labels', {
      method: 'POST', headers: cheaders, env: cenv, body: { name: 'VeganLabel', color: 'green' },
    }).then((r) => r.json()) as { id: string };

    await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers: cheaders, env: cenv,
      body: { name: 'Dish', price: 12, labelIds: [labelId] },
    });

    const res = await testRequest('/catalog', { env: cenv });
    expect(res.status).toBe(200);
    const catalog = await res.json() as {
      labels: Array<{ id: string; name: string; color: string }>;
      categories: Array<{ entries: Array<{ labelIds: string[] }> }>;
    };
    expect(catalog.labels).toHaveLength(1);
    expect(catalog.labels[0].name).toBe('VeganLabel');
    expect(catalog.labels[0].color).toBe('green');
    const entry = catalog.categories[0].entries[0];
    expect(entry.labelIds).toContain(labelId);
  });
});

// ── i18n round-trip ───────────────────────────────────────────────────

describe('Label i18n', () => {
  it('stores and returns i18n translations', async () => {
    const { env, headers } = await setup();
    const i18n = { en: { name: 'Vegan' }, de: { name: 'Vegan (DE)' } };
    const { id } = await testRequest('/admin/labels', {
      method: 'POST', headers, env, body: { name: 'Vegano', color: 'green', i18n },
    }).then((r) => r.json()) as { id: string };

    const res = await testRequest('/admin/labels', { headers, env });
    const { labels } = await res.json() as { labels: Array<{ id: string; i18n: unknown }> };
    const label = labels.find((l) => l.id === id);
    expect(label?.i18n).toMatchObject(i18n);
  });
});
