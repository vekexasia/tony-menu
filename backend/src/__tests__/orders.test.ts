import { describe, it, expect } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedCategory, seedEntry, type TestDb } from './helpers/db';
import { currentOrderDay } from '../routes/orders';

const SEND_MODULES = JSON.stringify({
  ordering: { enabled: true, mode: 'send', submitMode: 'diner' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
});

let ipCounter = 0;

function orderingDb(modules: string | null = SEND_MODULES): TestDb {
  const db = createTestDb();
  seedSettings(db, { modules });
  seedCategory(db, 'cat-1');
  seedEntry(db, 'entry-1', 'cat-1', { name: 'Bruschetta', price: 750 });
  seedEntry(db, 'entry-2', 'cat-1', { name: 'Pasta', price: 1200 });
  return db;
}

function submit(db: TestDb, body: unknown, ip?: string) {
  // Unique IP per call site so the module-global rate limiter never bleeds across tests.
  return testRequest('/orders', {
    method: 'POST',
    body,
    headers: { 'cf-connecting-ip': ip ?? `10.0.0.${++ipCounter}` },
    env: makeDbEnv(db),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    lines: [{ entryId: 'entry-1', quantity: 2 }],
    ...overrides,
  };
}

describe('POST /orders', () => {
  it('creates an order with frozen snapshots and daily number 1', async () => {
    const db = orderingDb();
    const res = await submit(db, validBody({ lines: [{ entryId: 'entry-1', quantity: 2 }, { entryId: 'entry-2', quantity: 1 }] }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; orderId: string; dailyNumber: number };
    expect(body.ok).toBe(true);
    expect(body.dailyNumber).toBe(1);

    const order = db.raw.prepare('SELECT * FROM orders WHERE id = ?').get(body.orderId) as Record<string, unknown>;
    expect(order.order_day).toBe(currentOrderDay());
    expect(order.status).toBe('submitted');

    const items = db.raw.prepare('SELECT name, price, quantity FROM order_items WHERE order_id = ? ORDER BY name').all(body.orderId);
    expect(items).toEqual([
      { name: 'Bruschetta', price: 750, quantity: 2 },
      { name: 'Pasta', price: 1200, quantity: 1 },
    ]);
  });

  it('accepts demo submits without creating an order', async () => {
    const db = orderingDb();
    const res = await testRequest('/orders', {
      method: 'POST',
      body: validBody(),
      headers: { 'cf-connecting-ip': `10.0.0.${++ipCounter}` },
      env: makeDbEnv(db, { DEMO_MODE: 'true' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, orderId: 'demo-order', dailyNumber: 1 });
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
  });

  it('snapshots destinations per item at submit time', async () => {
    const db = orderingDb();
    const now = Date.now();
    db.raw.prepare('INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)')
      .run('dest-kitchen', 'Kitchen', now, now);
    db.raw.prepare('INSERT INTO entry_destinations (entry_id, destination_id) VALUES (?, ?)')
      .run('entry-1', 'dest-kitchen');

    const res = await submit(db, validBody());
    expect(res.status).toBe(200);
    const { orderId } = await res.json() as { orderId: string };

    const rows = db.raw.prepare(
      `SELECT oid.destination_id, oid.destination_name, oid.printed_at
       FROM order_item_destinations oid
       JOIN order_items oi ON oi.id = oid.order_item_id
       WHERE oi.order_id = ?`,
    ).all(orderId);
    expect(rows).toEqual([{ destination_id: 'dest-kitchen', destination_name: 'Kitchen', printed_at: null }]);
  });

  it('increments daily numbers and retries on concurrent conflict', async () => {
    const db = orderingDb();
    const first = await submit(db, validBody());
    expect(((await first.json()) as { dailyNumber: number }).dailyNumber).toBe(1);

    // Simulate a concurrent submit winning the same number: inject a competing
    // order between the COUNT(*) read and the insert batch.
    const origBatch = db.d1.batch.bind(db.d1);
    let injected = false;
    db.d1.batch = async (statements) => {
      if (!injected) {
        injected = true;
        const now = Date.now();
        db.raw.prepare(
          'INSERT INTO orders (id, order_day, daily_number, idempotency_key, created_at, updated_at) VALUES (?, ?, 2, ?, ?, ?)',
        ).run(crypto.randomUUID(), currentOrderDay(), crypto.randomUUID(), now, now);
      }
      return origBatch(statements);
    };

    const second = await submit(db, validBody());
    expect(second.status).toBe(200);
    // Number 2 was taken by the concurrent order mid-flight; retry landed on 3.
    expect(((await second.json()) as { dailyNumber: number }).dailyNumber).toBe(3);
  });

  it('rejects stale items listing every offending id, never dropping them', async () => {
    const db = orderingDb();
    db.raw.prepare('UPDATE menu_entries SET out_of_stock = 1 WHERE id = ?').run('entry-2');

    const res = await submit(db, validBody({
      lines: [
        { entryId: 'entry-1', quantity: 1 },
        { entryId: 'entry-2', quantity: 1 },
        { entryId: 'entry-deleted', quantity: 1 },
      ],
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; staleEntryIds: string[] };
    expect(body.error).toBe('stale_items');
    expect(body.staleEntryIds.sort()).toEqual(['entry-2', 'entry-deleted']);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 0 });
  });

  it('rejects hidden items', async () => {
    const db = orderingDb();
    db.raw.prepare('UPDATE menu_entries SET hidden = 1 WHERE id = ?').run('entry-1');
    const res = await submit(db, validBody());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { staleEntryIds: string[] }).staleEntryIds).toEqual(['entry-1']);
  });

  it('is idempotent: same key returns the same order without creating another', async () => {
    const db = orderingDb();
    const body = validBody();
    const first = await res(await submit(db, body));
    const second = await res(await submit(db, body));
    expect(second).toEqual(first);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM orders').get()).toEqual({ c: 1 });
  });

  it('returns 404 when ordering module is off, summary-only, or waiter-only', async () => {
    const cases = [
      null,
      JSON.stringify({ ordering: { enabled: false, mode: 'send', submitMode: 'diner' } }),
      JSON.stringify({ ordering: { enabled: true, mode: 'summary', submitMode: 'diner' } }),
      JSON.stringify({ ordering: { enabled: true, mode: 'send', submitMode: 'waiter' } }),
    ];
    for (const modules of cases) {
      const result = await submit(orderingDb(modules), validBody());
      expect(result.status).toBe(404);
    }
  });

  it('rate limits per IP', async () => {
    const db = orderingDb();
    const ip = '203.0.113.99';
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) {
      last = await submit(db, validBody(), ip);
    }
    expect(last!.status).toBe(429);
  });

  it('rejects malformed bodies', async () => {
    const db = orderingDb();
    expect((await submit(db, { idempotencyKey: 'x'.repeat(20), lines: [] })).status).toBe(400);
    expect((await submit(db, { lines: [{ entryId: 'entry-1', quantity: 1 }] })).status).toBe(400);
    expect((await submit(db, validBody({ lines: [{ entryId: 'entry-1', quantity: 0 }] }))).status).toBe(400);
  });
});

async function res(response: Response) {
  expect(response.status).toBe(200);
  return response.json();
}
