import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedCategory, seedEntry, signTestJwt, installJwksMock, type TestDb } from './helpers/db';
import { INTENT_TTL_MS } from '../routes/orders';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';

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

async function adminHeaders() {
  return { 'Cf-Access-Jwt-Assertion': await signTestJwt(ADMIN_UID) };
}

function adminEnv(db: TestDb) {
  return makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
}

async function makeToken(db: TestDb): Promise<string> {
  const res = await createIntent(db);
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
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

describe('GET /admin/order-intents/:token', () => {
  it('resolves lines against the current menu, flagging stale items', async () => {
    const db = intentsDb();
    const res = await createIntent(db, { lines: [{ entryId: 'entry-1', quantity: 2 }, { entryId: 'entry-2', quantity: 1 }, { entryId: 'entry-gone', quantity: 1 }] });
    const { token } = await res.json() as { token: string };
    // entry-2 goes out of stock AFTER the intent was created.
    db.raw.prepare('UPDATE menu_entries SET out_of_stock = 1 WHERE id = ?').run('entry-2');

    const review = await testRequest(`/admin/order-intents/${token}`, { headers: await adminHeaders(), env: adminEnv(db) });
    expect(review.status).toBe(200);
    const body = await review.json() as { status: string; lines: { entryId: string; name: string | null; price: number | null; unavailable: boolean }[] };
    expect(body.status).toBe('pending');
    expect(body.lines).toEqual([
      { entryId: 'entry-1', quantity: 2, name: 'Bruschetta', price: 750, unavailable: false },
      { entryId: 'entry-2', quantity: 1, name: 'Pasta', price: 1200, unavailable: true },
      { entryId: 'entry-gone', quantity: 1, name: null, price: null, unavailable: true },
    ]);
  });

  it('reports expired status', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    db.raw.prepare('UPDATE order_intents SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, token);

    const review = await testRequest(`/admin/order-intents/${token}`, { headers: await adminHeaders(), env: adminEnv(db) });
    expect(((await review.json()) as { status: string }).status).toBe('expired');
  });

  it('404s on unknown token', async () => {
    const db = intentsDb();
    const res = await testRequest('/admin/order-intents/nope', { headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/order-intents/:token/consume', () => {
  function consume(db: TestDb, token: string, headers: Record<string, string>) {
    return testRequest(`/admin/order-intents/${token}/consume`, { method: 'POST', headers, env: adminEnv(db) });
  }

  it('creates an order through the shared #17 path with snapshots and daily number', async () => {
    const db = intentsDb();
    const now = Date.now();
    db.raw.prepare('INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
      .run('dest-kitchen', 'Kitchen', now, now);
    db.raw.prepare('INSERT INTO entry_destinations (entry_id, destination_id) VALUES (?, ?)')
      .run('entry-1', 'dest-kitchen');
    const token = await makeToken(db);
    const headers = await adminHeaders();

    const res = await consume(db, token, headers);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; orderId: string; dailyNumber: number };
    expect(body.dailyNumber).toBe(1);

    const items = db.raw.prepare('SELECT name, price, quantity FROM order_items WHERE order_id = ?').all(body.orderId);
    expect(items).toEqual([{ name: 'Bruschetta', price: 750, quantity: 2 }]);
    const dests = db.raw.prepare(
      'SELECT destination_name FROM order_item_destinations oid JOIN order_items oi ON oi.id = oid.order_item_id WHERE oi.order_id = ?',
    ).all(body.orderId);
    expect(dests).toEqual([{ destination_name: 'Kitchen' }]);
    const intent = db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null };
    expect(intent.consumed_at).not.toBeNull();
  });

  it('accepts demo intent consume without creating an order', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    const res = await testRequest(`/admin/order-intents/${token}/consume`, {
      method: 'POST',
      headers: await adminHeaders(),
      env: makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID, DEMO_MODE: 'true' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderId: 'demo-order', dailyNumber: 1 });
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
    expect((db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null }).consumed_at).not.toBeNull();
  });

  it('consumes exactly once: second consume gets 409 and no second order exists', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    const headers = await adminHeaders();

    expect((await consume(db, token, headers)).status).toBe(200);
    const second = await consume(db, token, headers);
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe('consumed');
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 1 });
  });

  it('is atomic under a race: a concurrent claim between read and update loses cleanly', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    const headers = await adminHeaders();

    // Simulate a concurrent consume winning between the SELECT and the
    // conditional UPDATE: mark the intent consumed on the first UPDATE attempt
    // before it runs, so the claim's WHERE consumed_at IS NULL matches 0 rows.
    const origPrepare = db.raw.prepare.bind(db.raw);
    let injected = false;
    // Monkey-patch for the race simulation.
    db.raw.prepare = ((sql: string) => {
      if (!injected && /update\s+"?order_intents"?/i.test(sql)) {
        injected = true;
        origPrepare('UPDATE order_intents SET consumed_at = ? WHERE id = ?').run(Date.now(), token);
      }
      return origPrepare(sql);
    }) as typeof db.raw.prepare;

    const res = await consume(db, token, headers);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('consumed');
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
  });

  it('rejects expired intents without creating an order', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    db.raw.prepare('UPDATE order_intents SET expires_at = ? WHERE id = ?').run(Date.now() - 1000, token);

    const res = await consume(db, token, await adminHeaders());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('expired');
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
  });

  it('re-validates availability at consume time: stale items 409 and release the claim', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    // Goes out of stock after the intent was created.
    db.raw.prepare('UPDATE menu_entries SET out_of_stock = 1 WHERE id = ?').run('entry-1');

    const res = await consume(db, token, await adminHeaders());
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; staleEntryIds: string[] };
    expect(body.error).toBe('stale_items');
    expect(body.staleEntryIds).toEqual(['entry-1']);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
    // Claim released — the intent stays consumable once the menu is fixed.
    const intent = db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null };
    expect(intent.consumed_at).toBeNull();
  });

  it('requires admin auth', async () => {
    const db = intentsDb();
    const token = await makeToken(db);
    const res = await testRequest(`/admin/order-intents/${token}/consume`, { method: 'POST', env: adminEnv(db) });
    expect(res.status).toBe(401);
  });
});
