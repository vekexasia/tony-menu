import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, seedCategory, seedEntry, signTestJwt, installJwksMock } from './helpers/db';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';
const R2_BASE = 'https://cdn.test.local';

// Minimal in-memory R2 stub recording put/delete calls.
function makeR2() {
  const objects = new Map<string, unknown>();
  const calls = { put: [] as string[], delete: [] as string[] };
  const bucket = {
    async put(key: string, value: unknown) {
      calls.put.push(key);
      objects.set(key, value);
      return { key } as R2Object;
    },
    async delete(key: string) {
      calls.delete.push(key);
      objects.delete(key);
    },
    async get() { return null; },
    async head() { return null; },
    async list() { return { objects: [], truncated: false } as unknown as R2Objects; },
  } as unknown as R2Bucket;
  return { bucket, objects, calls };
}

function jpegBody(): ArrayBuffer {
  const buf = new Uint8Array(64);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf.buffer;
}

async function adminEnv(r2?: ReturnType<typeof makeR2>, db = createTestDb()) {
  seedSettings(db);
  const overrides: Record<string, unknown> = { ADMIN_EMAILS: ADMIN_UID };
  if (r2) {
    overrides.PUBLIC_MENU_BUCKET = r2.bucket;
    overrides.R2_PUBLIC_URL = R2_BASE;
  }
  const env = makeDbEnv(db, overrides);
  const token = await signTestJwt(ADMIN_UID);
  return { db, env, headers: { 'Cf-Access-Jwt-Assertion': token } };
}

describe('POST /admin/entries/:id/image', () => {
  it('puts to R2 and stores image_url on the entry', async () => {
    const r2 = makeR2();
    const { db, env, headers } = await adminEnv(r2);
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const res = await testRequest('/admin/entries/entry-1/image', {
      method: 'POST', headers, env, body: jpegBody(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { imageUrl: string };
    expect(r2.calls.put.some(k => k.startsWith('images/entries/entry-1-'))).toBe(true);
    expect(body.imageUrl.startsWith(`${R2_BASE}/images/entries/entry-1-`)).toBe(true);

    const row = db.raw.prepare('SELECT image_url FROM menu_entries WHERE id = ?').get('entry-1') as { image_url: string };
    expect(row.image_url).toBe(body.imageUrl);
  });

  it('returns 404 for a missing entry', async () => {
    const r2 = makeR2();
    const { env, headers } = await adminEnv(r2);
    const res = await testRequest('/admin/entries/nope/image', {
      method: 'POST', headers, env, body: jpegBody(),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /admin/entries/:id/image', () => {
  it('deletes the old R2 object and nulls image_url', async () => {
    const r2 = makeR2();
    const { db, env, headers } = await adminEnv(r2);
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const key = 'images/entries/entry-1-123.jpg';
    db.raw.prepare('UPDATE menu_entries SET image_url = ? WHERE id = ?').run(`${R2_BASE}/${key}`, 'entry-1');

    const res = await testRequest('/admin/entries/entry-1/image', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);
    expect(r2.calls.delete).toContain(key);
    const row = db.raw.prepare('SELECT image_url FROM menu_entries WHERE id = ?').get('entry-1') as { image_url: string | null };
    expect(row.image_url).toBeNull();
  });
});

describe('POST /admin/header-image', () => {
  it('uploads and stores headerImage on settings.info', async () => {
    const r2 = makeR2();
    const { db, env, headers } = await adminEnv(r2);

    const res = await testRequest('/admin/header-image', {
      method: 'POST', headers, env, body: jpegBody(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { imageUrl: string };
    expect(r2.calls.put.some(k => k.startsWith('images/settings/header-'))).toBe(true);

    const row = db.raw.prepare('SELECT info FROM settings WHERE id = 1').get() as { info: string };
    expect(JSON.parse(row.info).headerImage).toBe(body.imageUrl);
  });
});

describe('POST /admin/promotion-image', () => {
  it('uploads and stores url on settings.promotion_alert', async () => {
    const r2 = makeR2();
    const { db, env, headers } = await adminEnv(r2);

    const res = await testRequest('/admin/promotion-image', {
      method: 'POST', headers, env, body: jpegBody(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { imageUrl: string };

    const row = db.raw.prepare('SELECT promotion_alert FROM settings WHERE id = 1').get() as { promotion_alert: string };
    expect(JSON.parse(row.promotion_alert).url).toBe(body.imageUrl);
  });
});

describe('DELETE /admin/entries/:id removes its R2 image', () => {
  it('deletes the entry image object on entry delete', async () => {
    const r2 = makeR2();
    const { db, env, headers } = await adminEnv(r2);
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const key = 'images/entries/entry-1-9.jpg';
    db.raw.prepare('UPDATE menu_entries SET image_url = ? WHERE id = ?').run(`${R2_BASE}/${key}`, 'entry-1');

    const res = await testRequest('/admin/entries/entry-1', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);
    expect(r2.calls.delete).toContain(key);
  });
});

describe('DELETE /admin/menus/:menuId FK cascade', () => {
  it('removes the menu and its memberships, keeps the entry', async () => {
    const { db, env, headers } = await adminEnv();
    seedMenu(db, 'm-1', 'food');
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    db.raw.prepare('INSERT INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)').run('m-1', 'entry-1');

    const res = await testRequest('/admin/menus/m-1', { method: 'DELETE', headers, env });
    expect(res.status).toBe(200);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menus').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menu_entry_memberships').get()).toEqual({ n: 0 });
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM menu_entries').get()).toEqual({ n: 1 });
  });
});

describe('PUT /admin/hours', () => {
  it('persists a valid opening schedule', async () => {
    const { db, env, headers } = await adminEnv();
    const openingSchedule = {
      open: true,
      minWaitSlot: 0,
      slotDuration: 30,
      maxDaysLookAhead: 7,
      schedule: [[{ start: '09:00', end: '12:00' }], [], [], [], [], [], []],
    };
    const res = await testRequest('/admin/hours', {
      method: 'PUT', headers, env, body: { openingSchedule },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT opening_schedule FROM settings WHERE id = 1').get() as { opening_schedule: string };
    expect(JSON.parse(row.opening_schedule)).toEqual(openingSchedule);
  });

  it('rejects a malformed schedule with 400', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/hours', {
      method: 'PUT', headers, env, body: { openingSchedule: { open: true } },
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /admin/entries/:id/move (404 path)', () => {
  it('returns 404 when target category is missing', async () => {
    const { db, env, headers } = await adminEnv();
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const res = await testRequest('/admin/entries/entry-1/move', {
      method: 'POST', headers, env, body: { targetCategoryId: 'ghost' },
    });
    expect(res.status).toBe(404);
  });
});

describe('PUT /admin/publication validation', () => {
  it('rejects a malformed body with 400 instead of 500', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/publication', {
      method: 'PUT', headers, env, body: { published: 'yes' },
    });
    expect(res.status).toBe(400);
  });
});
