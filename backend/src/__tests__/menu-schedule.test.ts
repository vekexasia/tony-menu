import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, signTestJwt, installJwksMock } from './helpers/db';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';

async function adminEnv() {
  const db = createTestDb();
  seedSettings(db);
  seedMenu(db, 'menu-1', 'food');
  const env = makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
  const token = await signTestJwt(ADMIN_UID);
  return { db, env, headers: { 'Cf-Access-Jwt-Assertion': token } };
}

type MenuRow = {
  id: string;
  availableFrom: string | null;
  availableTo: string | null;
};

describe('menu schedule — GET /admin/menus', () => {
  it('returns availableFrom and availableTo as null by default', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as { menus: MenuRow[] };
    expect(body.menus[0].availableFrom).toBeNull();
    expect(body.menus[0].availableTo).toBeNull();
  });
});

describe('menu schedule — PATCH /admin/menus/:menuId', () => {
  it('sets a same-day schedule', async () => {
    const { env, headers } = await adminEnv();
    const patch = await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '11:00', availableTo: '15:00' },
    });
    expect(patch.status).toBe(200);

    const res = await testRequest('/admin/menus', { headers, env });
    const body = await res.json() as { menus: MenuRow[] };
    const menu = body.menus.find((m) => m.id === 'menu-1')!;
    expect(menu.availableFrom).toBe('11:00');
    expect(menu.availableTo).toBe('15:00');
  });

  it('sets an overnight schedule', async () => {
    const { env, headers } = await adminEnv();
    await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '22:00', availableTo: '02:00' },
    });
    const res = await testRequest('/admin/menus', { headers, env });
    const body = await res.json() as { menus: MenuRow[] };
    const menu = body.menus.find((m) => m.id === 'menu-1')!;
    expect(menu.availableFrom).toBe('22:00');
    expect(menu.availableTo).toBe('02:00');
  });

  it('clears a schedule by sending null for both', async () => {
    const { env, headers } = await adminEnv();
    await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '11:00', availableTo: '15:00' },
    });
    await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: null, availableTo: null },
    });
    const res = await testRequest('/admin/menus', { headers, env });
    const body = await res.json() as { menus: MenuRow[] };
    const menu = body.menus.find((m) => m.id === 'menu-1')!;
    expect(menu.availableFrom).toBeNull();
    expect(menu.availableTo).toBeNull();
  });

  it('rejects an invalid HH:MM format', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '9:00', availableTo: '15:00' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-time strings', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: 'lunch', availableTo: '15:00' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects setting only availableFrom without availableTo', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '11:00' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects setting only availableTo without availableFrom', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableTo: '15:00' },
    });
    expect(res.status).toBe(400);
  });
});

describe('menu schedule — catalog response', () => {
  it('includes availableFrom and availableTo in the catalog', async () => {
    const { db, env, headers } = await adminEnv();

    // Set schedule via admin API
    await testRequest('/admin/menus/menu-1', {
      method: 'PATCH',
      headers,
      env,
      body: { availableFrom: '12:00', availableTo: '14:00' },
    });

    // Publish and fetch catalog
    db.raw.prepare(`UPDATE settings SET publication_state = 'published' WHERE id = 1`).run();
    const res = await testRequest('/catalog', { env });
    expect(res.status).toBe(200);
    const body = await res.json() as { menus: MenuRow[] };
    const menu = body.menus.find((m) => m.id === 'menu-1')!;
    expect(menu.availableFrom).toBe('12:00');
    expect(menu.availableTo).toBe('14:00');
  });

  it('catalog menu has null schedule fields when not set', async () => {
    const { db, env } = await adminEnv();
    db.raw.prepare(`UPDATE settings SET publication_state = 'published' WHERE id = 1`).run();
    const res = await testRequest('/catalog', { env });
    expect(res.status).toBe(200);
    const body = await res.json() as { menus: MenuRow[] };
    expect(body.menus[0].availableFrom).toBeNull();
    expect(body.menus[0].availableTo).toBeNull();
  });
});
