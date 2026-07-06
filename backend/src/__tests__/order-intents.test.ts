import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedCategory, seedEntry, installJwksMock, type TestDb } from './helpers/db';
import { INTENT_TTL_MS } from '../routes/orders';

beforeAll(() => installJwksMock());



const WAITER_MODULES = JSON.stringify({
  ordering: { enabled: true, mode: 'send', submitMode: 'waiter' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
});

let ipCounter = 0;

function intentsDb(modules: string | null = WAITER_MODULES): TestDb {
  const db = createTestDb();
  seedSettings(db, { modules });
  seedCategory(db, 'cat-1');
  seedEntry(db, 'entry-1', 'cat-1', { name: 'Bruschetta', price: 750 });
  seedEntry(db, 'entry-2', 'cat-1', { name: 'Pasta', price: 1200 });
  return db;
}

function createIntent(db: TestDb, body: unknown = { lines: [{ entryId: 'entry-1', quantity: 2 }] }) {
  // Unique IP per call so the module-global rate limiter never bleeds across tests.
  return testRequest('/orders/intents', {
    method: 'POST',
    body,
    headers: { 'cf-connecting-ip': `10.1.0.${++ipCounter}` },
    env: makeDbEnv(db),
  });
}


describe('POST /orders/intents', () => {
  it('creates an intent with a 30-minute expiry', async () => {
    const db = intentsDb();
    const before = Date.now();
    const res = await createIntent(db);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; token: string; expiresAt: number };
    expect(body.ok).toBe(true);
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + INTENT_TTL_MS);

    const row = db.raw.prepare('SELECT lines, consumed_at FROM order_intents WHERE id = ?').get(body.token) as { lines: string; consumed_at: number | null };
    expect(JSON.parse(row.lines)).toEqual([{ entryId: 'entry-1', quantity: 2 }]);
    expect(row.consumed_at).toBeNull();
  });

  it('is gated on submitMode: 404 for diner-only, module off, or summary mode', async () => {
    const cases = [
      null,
      JSON.stringify({ ordering: { enabled: true, mode: 'send', submitMode: 'diner' } }),
      JSON.stringify({ ordering: { enabled: false, mode: 'send', submitMode: 'waiter' } }),
      JSON.stringify({ ordering: { enabled: true, mode: 'summary', submitMode: 'both' } }),
    ];
    for (const modules of cases) {
      expect((await createIntent(intentsDb(modules))).status).toBe(404);
    }
    // 'both' allows it.
    const both = JSON.stringify({ ordering: { enabled: true, mode: 'send', submitMode: 'both' } });
    expect((await createIntent(intentsDb(both))).status).toBe(200);
  });

  it('rejects malformed bodies', async () => {
    const db = intentsDb();
    expect((await createIntent(db, { lines: [] })).status).toBe(400);
    expect((await createIntent(db, { lines: [{ entryId: 'entry-1', quantity: 0 }] })).status).toBe(400);
  });
});

// Review + consume moved to staff-gated /staff/order-intents/* in #15 — see staff.test.ts.
