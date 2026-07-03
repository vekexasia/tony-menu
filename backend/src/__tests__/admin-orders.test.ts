import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import {
  createTestDb,
  makeDbEnv,
  seedSettings,
  seedCategory,
  seedEntry,
  signTestJwt,
  installJwksMock,
  type TestDb,
} from './helpers/db';
import { currentOrderDay } from '../routes/orders';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-orders-tests';

async function setup() {
  const db = createTestDb();
  seedSettings(db);
  const env = makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
  const token = await signTestJwt(ADMIN_UID);
  const headers = { 'Cf-Access-Jwt-Assertion': token };
  return { db, env, headers };
}

function seedOrder(db: TestDb, orderId: string, status = 'submitted', dailyNumber = 1) {
  const now = Date.now();
  db.raw.prepare(
    'INSERT INTO orders (id, order_day, daily_number, status, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(orderId, currentOrderDay(), dailyNumber, status, crypto.randomUUID(), now, now);
}

function seedOrderItem(db: TestDb, itemId: string, orderId: string, name = 'Pizza') {
  db.raw.prepare(
    'INSERT INTO order_items (id, order_id, name, price, quantity, created_at) VALUES (?, ?, ?, 1000, 1, ?)',
  ).run(itemId, orderId, name, Date.now());
}

function seedItemDestination(db: TestDb, id: string, itemId: string, destName: string, destId: string | null = null) {
  db.raw.prepare(
    'INSERT INTO order_item_destinations (id, order_item_id, destination_id, destination_name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, itemId, destId, destName, Date.now());
}

// ── Status transitions ───────────────────────────────────────────────

describe('PATCH /admin/orders/:id/status', () => {
  it.each([
    ['submitted', 'ready'],
    ['ready', 'served'],
    ['submitted', 'rejected'],
    ['ready', 'rejected'],
  ])('allows %s → %s', async (from, to) => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1', from);
    const res = await testRequest('/admin/orders/order-1/status', {
      method: 'PATCH', headers, env,
      body: { status: to, ...(to === 'rejected' ? { rejectReason: 'out of stock' } : {}) },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT status FROM orders WHERE id = ?').get('order-1') as { status: string };
    expect(row.status).toBe(to);
  });

  it.each([
    ['submitted', 'served'],
    ['served', 'ready'],
    ['served', 'rejected'],
    ['rejected', 'ready'],
    ['rejected', 'served'],
  ])('rejects illegal %s → %s with 409', async (from, to) => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1', from);
    const res = await testRequest('/admin/orders/order-1/status', {
      method: 'PATCH', headers, env,
      body: { status: to, rejectReason: 'x' },
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('illegal_transition');
    const row = db.raw.prepare('SELECT status FROM orders WHERE id = ?').get('order-1') as { status: string };
    expect(row.status).toBe(from);
  });

  it('requires a reason when rejecting and stores it', async () => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1');

    const missing = await testRequest('/admin/orders/order-1/status', {
      method: 'PATCH', headers, env, body: { status: 'rejected' },
    });
    expect(missing.status).toBe(400);

    const res = await testRequest('/admin/orders/order-1/status', {
      method: 'PATCH', headers, env, body: { status: 'rejected', rejectReason: 'Kitchen closed' },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT status, reject_reason FROM orders WHERE id = ?').get('order-1') as { status: string; reject_reason: string };
    expect(row).toEqual({ status: 'rejected', reject_reason: 'Kitchen closed' });
  });

  it('404s on unknown order', async () => {
    const { env, headers } = await setup();
    const res = await testRequest('/admin/orders/nope/status', {
      method: 'PATCH', headers, env, body: { status: 'ready' },
    });
    expect(res.status).toBe(404);
  });
});

// ── Per-destination printed independence ─────────────────────────────

describe('PATCH /admin/order-item-destinations/:id/printed', () => {
  it('marks one department done without affecting the other on the same item', async () => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1');
    seedOrderItem(db, 'item-1', 'order-1', 'Pizza + fries');
    // Item routed to two departments — the epic's pizza+fries case.
    seedItemDestination(db, 'oid-pizza', 'item-1', 'Pizza');
    seedItemDestination(db, 'oid-fries', 'item-1', 'Friggitoria');

    const res = await testRequest('/admin/order-item-destinations/oid-pizza/printed', {
      method: 'PATCH', headers, env, body: { printed: true },
    });
    expect(res.status).toBe(200);

    const rows = db.raw.prepare('SELECT id, printed_at FROM order_item_destinations ORDER BY id').all() as Array<{ id: string; printed_at: number | null }>;
    expect(rows.find((r) => r.id === 'oid-pizza')!.printed_at).not.toBeNull();
    expect(rows.find((r) => r.id === 'oid-fries')!.printed_at).toBeNull();
  });

  it('unmarks (printed: false) and 404s on unknown row', async () => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1');
    seedOrderItem(db, 'item-1', 'order-1');
    seedItemDestination(db, 'oid-1', 'item-1', 'Kitchen');
    db.raw.prepare('UPDATE order_item_destinations SET printed_at = ? WHERE id = ?').run(Date.now(), 'oid-1');

    const res = await testRequest('/admin/order-item-destinations/oid-1/printed', {
      method: 'PATCH', headers, env, body: { printed: false },
    });
    expect(res.status).toBe(200);
    const row = db.raw.prepare('SELECT printed_at FROM order_item_destinations WHERE id = ?').get('oid-1') as { printed_at: number | null };
    expect(row.printed_at).toBeNull();

    const missing = await testRequest('/admin/order-item-destinations/nope/printed', {
      method: 'PATCH', headers, env, body: { printed: true },
    });
    expect(missing.status).toBe(404);
  });
});

// ── Board listing ────────────────────────────────────────────────────

describe('GET /admin/orders', () => {
  it("returns today's orders with items and destination rows", async () => {
    const { db, env, headers } = await setup();
    seedOrder(db, 'order-1', 'submitted', 1);
    seedOrder(db, 'order-2', 'ready', 2);
    seedOrderItem(db, 'item-1', 'order-1', 'Margherita');
    seedItemDestination(db, 'oid-1', 'item-1', 'Pizza');

    const res = await testRequest('/admin/orders', { headers, env });
    expect(res.status).toBe(200);
    const body = await res.json() as { day: number; orders: Array<{ id: string; dailyNumber: number; status: string; items: Array<{ name: string; destinations: Array<{ id: string; destinationId: string | null; destinationName: string; printedAt: number | null }> }> }> };
    expect(body.day).toBe(currentOrderDay());
    // Newest (highest daily number) first.
    expect(body.orders.map((o) => o.dailyNumber)).toEqual([2, 1]);
    const order1 = body.orders.find((o) => o.id === 'order-1')!;
    expect(order1.items[0].name).toBe('Margherita');
    expect(order1.items[0].destinations).toEqual([
      { id: 'oid-1', destinationId: null, destinationName: 'Pizza', printedAt: null },
    ]);
  });

  it('requires admin auth', async () => {
    const { env } = await setup();
    const res = await testRequest('/admin/orders', { env });
    expect(res.status).toBe(401);
  });
});

// ── Order destinations CRUD ──────────────────────────────────────────

describe('order destinations CRUD', () => {
  it('creates, lists, renames, and deletes destinations', async () => {
    const { db, env, headers } = await setup();

    const created = await testRequest('/admin/order-destinations', {
      method: 'POST', headers, env, body: { name: 'Kitchen' },
    });
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };

    await testRequest('/admin/order-destinations', { method: 'POST', headers, env, body: { name: 'Bar' } });

    const list = await testRequest('/admin/order-destinations', { headers, env });
    const { destinations } = await list.json() as { destinations: Array<{ id: string; name: string }> };
    expect(destinations.map((d) => d.name)).toEqual(['Kitchen', 'Bar']);

    const renamed = await testRequest(`/admin/order-destinations/${id}`, {
      method: 'PATCH', headers, env, body: { name: 'Cucina' },
    });
    expect(renamed.status).toBe(200);
    expect((db.raw.prepare('SELECT name FROM order_destinations WHERE id = ?').get(id) as { name: string }).name).toBe('Cucina');

    const deleted = await testRequest(`/admin/order-destinations/${id}`, { method: 'DELETE', headers, env });
    expect(deleted.status).toBe(200);
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM order_destinations').get()).toEqual({ c: 1 });
  });

  it('rejects blank names', async () => {
    const { env, headers } = await setup();
    const res = await testRequest('/admin/order-destinations', {
      method: 'POST', headers, env, body: { name: '  ' },
    });
    expect(res.status).toBe(400);
  });

  it('deleting a destination keeps frozen names on order rows and cascades entry assignments', async () => {
    const { db, env, headers } = await setup();
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');

    const { id } = await testRequest('/admin/order-destinations', {
      method: 'POST', headers, env, body: { name: 'Kitchen' },
    }).then((r) => r.json()) as { id: string };
    db.raw.prepare('INSERT INTO entry_destinations (entry_id, destination_id) VALUES (?, ?)').run('entry-1', id);
    seedOrder(db, 'order-1');
    seedOrderItem(db, 'item-1', 'order-1');
    seedItemDestination(db, 'oid-1', 'item-1', 'Kitchen', id);

    await testRequest(`/admin/order-destinations/${id}`, { method: 'DELETE', headers, env });

    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM entry_destinations').get()).toEqual({ c: 0 });
    const row = db.raw.prepare('SELECT destination_id, destination_name FROM order_item_destinations WHERE id = ?').get('oid-1') as { destination_id: string | null; destination_name: string };
    expect(row).toEqual({ destination_id: null, destination_name: 'Kitchen' });
  });
});

// ── Entry destination assignments (multi-select picker backend) ─────

describe('entry destinationIds', () => {
  it('sets and replaces entry destination assignments via PUT /admin/entries/:id', async () => {
    const { db, env, headers } = await setup();
    seedCategory(db, 'cat-1');
    seedEntry(db, 'entry-1', 'cat-1');
    const now = Date.now();
    for (const [id, name] of [['dest-a', 'Kitchen'], ['dest-b', 'Bar']]) {
      db.raw.prepare('INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(id, name, now, now);
    }

    const res = await testRequest('/admin/entries/entry-1', {
      method: 'PUT', headers, env, body: { destinationIds: ['dest-a', 'dest-b', 'dest-a'] },
    });
    expect(res.status).toBe(200);
    let rows = db.raw.prepare('SELECT destination_id FROM entry_destinations WHERE entry_id = ? ORDER BY destination_id').all('entry-1');
    expect(rows).toEqual([{ destination_id: 'dest-a' }, { destination_id: 'dest-b' }]);

    // Replace with a single assignment, then clear.
    await testRequest('/admin/entries/entry-1', { method: 'PUT', headers, env, body: { destinationIds: ['dest-b'] } });
    rows = db.raw.prepare('SELECT destination_id FROM entry_destinations WHERE entry_id = ?').all('entry-1');
    expect(rows).toEqual([{ destination_id: 'dest-b' }]);

    await testRequest('/admin/entries/entry-1', { method: 'PUT', headers, env, body: { destinationIds: [] } });
    expect(db.raw.prepare('SELECT COUNT(*) AS c FROM entry_destinations').get()).toEqual({ c: 0 });
  });
});
