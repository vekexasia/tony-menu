import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, seedCategory, seedEntry, seedMembership, signTestJwt, installJwksMock } from './helpers/db';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';

async function adminEnv() {
  const db = createTestDb();
  seedSettings(db);
  seedMenu(db, 'menu-1', 'food');
  seedCategory(db, 'cat-1');
  seedEntry(db, 'entry-1', 'cat-1', { name: 'Pizza' });
  seedEntry(db, 'entry-2', 'cat-1', { name: 'Hidden dish', hidden: true });
  seedMembership(db, 'menu-1', 'entry-1');
  const env = makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
  const token = await signTestJwt(ADMIN_UID);
  return { db, env, headers: { 'Cf-Access-Jwt-Assertion': token } };
}

describe('GET /admin/export', () => {
  it('returns 401 without auth', async () => {
    const db = createTestDb();
    seedSettings(db);
    const res = await testRequest('/admin/export', { env: makeDbEnv(db) });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const db = createTestDb();
    seedSettings(db);
    const token = await signTestJwt('not-admin');
    const res = await testRequest('/admin/export', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
      env: makeDbEnv(db, { ADMIN_EMAILS: 'someone-else' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns version 1 with all top-level keys', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/export', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.version).toBe(1);
    expect(typeof body.exportedAt).toBe('string');
    expect(body.settings).toBeDefined();
    expect(Array.isArray(body.menus)).toBe(true);
    expect(Array.isArray(body.categories)).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(Array.isArray(body.memberships)).toBe(true);
    expect(Array.isArray(body.variants)).toBe(true);
    expect(Array.isArray(body.extras)).toBe(true);
  });

  it('includes hidden entries', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/export', { headers, env });
    const body = await res.json() as { entries: Array<{ id: string; hidden: boolean }> };
    expect(body.entries).toHaveLength(2);
    const hidden = body.entries.find((e) => e.id === 'entry-2');
    expect(hidden?.hidden).toBe(true);
  });

  it('returns priceCents as integer', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/export', { headers, env });
    const body = await res.json() as { entries: Array<{ priceCents: number }> };
    expect(Number.isInteger(body.entries[0].priceCents)).toBe(true);
  });

  it('includes memberships', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/export', { headers, env });
    const body = await res.json() as { memberships: Array<{ menuId: string; entryId: string }> };
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].menuId).toBe('menu-1');
    expect(body.memberships[0].entryId).toBe('entry-1');
  });

  it('sets Content-Disposition attachment header', async () => {
    const { env, headers } = await adminEnv();
    const res = await testRequest('/admin/export', { headers, env });
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="menu-export-\d{4}-\d{2}-\d{2}\.json"$/);
  });
});
