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
import { computeCheckTotals } from '@menu/schemas';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';
let ipCounter = 0;

const WAITER_MODULES = JSON.stringify({
  ordering: { enabled: true, mode: 'send', submitMode: 'both' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
});

function checksDb(): TestDb {
  const db = createTestDb();
  seedSettings(db, { modules: WAITER_MODULES });
  seedCategory(db, 'cat-1');
  seedEntry(db, 'entry-1', 'cat-1', { name: 'Bruschetta', price: 750 });
  seedEntry(db, 'entry-2', 'cat-1', { name: 'Pasta', price: 1200 });
  const now = Date.now();
  db.raw.prepare('INSERT INTO areas (id, name, sort_order, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run('area-1', 'Sala', now, now);
  db.raw.prepare('INSERT INTO tables (id, name, active, sort_order, area_id, x, y, shape, created_at, updated_at) VALUES (?, ?, 1, 0, ?, 25, 25, ?, ?, ?)').run('table-1', '1', 'area-1', 'rect', now, now);
  return db;
}

function adminEnv(db: TestDb) {
  return makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
}

async function adminHeaders() {
  return { 'Cf-Access-Jwt-Assertion': await signTestJwt(ADMIN_UID) };
}

/** Open a session on table-1 directly in the DB and return its id. */
function openSession(db: TestDb, id = `sess-${++ipCounter}`): string {
  db.raw.prepare('INSERT INTO table_sessions (id, table_id, opened_at) VALUES (?, ?, ?)').run(id, 'table-1', Date.now());
  return id;
}

/** Insert an order + one item into the session. Returns orderId. */
function seedOrder(db: TestDb, sessionId: string, entryName: string, price: number, quantity: number, status = 'submitted'): string {
  const orderId = `order-${++ipCounter}`;
  const now = Date.now() + ipCounter; // keep createdAt monotonic
  db.raw.prepare('INSERT INTO orders (id, order_day, daily_number, status, idempotency_key, table_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(orderId, 20260101, ipCounter, status, `idem-${ipCounter}`, sessionId, now, now);
  db.raw.prepare('INSERT INTO order_items (id, order_id, name, price, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(`item-${ipCounter}`, orderId, entryName, price, quantity, now);
  return orderId;
}

async function createCheck(db: TestDb, sessionId: string) {
  return testRequest(`/admin/sessions/${sessionId}/check`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
}

describe('computeCheckTotals (money math)', () => {
  it('sums lines, applies percent discount rounded to the cent, clamps to zero', () => {
    const lines = [{ name: 'A', quantity: 2, unitPrice: 750 }, { name: 'B', quantity: 1, unitPrice: 1200 }];
    expect(computeCheckTotals(lines, null, [])).toEqual({ subtotal: 2700, total: 2700 });
    // 10% of 2700 = 270
    expect(computeCheckTotals(lines, { type: 'percent', value: 10 }, [])).toEqual({ subtotal: 2700, total: 2430 });
    // percent rounding: 33% of 2700 = 891
    expect(computeCheckTotals(lines, { type: 'percent', value: 33 }, []).total).toBe(2700 - 891);
    // amount discount + adjustments (signed)
    expect(computeCheckTotals(lines, { type: 'amount', value: 200 }, [{ label: 'tip', amount: 500 }, { label: 'coupon', amount: -100 }]))
      .toEqual({ subtotal: 2700, total: 2700 - 200 + 500 - 100 });
    // clamp: huge discount can't go negative
    expect(computeCheckTotals(lines, { type: 'amount', value: 999999 }, []).total).toBe(0);
  });
});

describe('check create (snapshot)', () => {
  it('freezes non-rejected order lines at current prices, excluding rejected', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 2, 'submitted');
    seedOrder(db, sessionId, 'Pasta', 1200, 1, 'served');
    seedOrder(db, sessionId, 'Rejected item', 500, 3, 'rejected');

    const res = await createCheck(db, sessionId);
    expect(res.status).toBe(201);
    const body = await res.json() as { status: string; lines: Array<{ name: string; quantity: number; unitPrice: number }>; subtotal: number; total: number };
    expect(body.status).toBe('open');
    expect(body.lines).toEqual([
      { name: 'Bruschetta', quantity: 2, unitPrice: 750 },
      { name: 'Pasta', quantity: 1, unitPrice: 1200 },
    ]);
    expect(body.subtotal).toBe(2700);
    expect(body.total).toBe(2700);
  });

  it('refuses a second open check (409 check_open)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    expect((await createCheck(db, sessionId)).status).toBe(201);
    const dup = await createCheck(db, sessionId);
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toBe('check_open');
  });

  it('404s an unknown session and 409s a closed one', async () => {
    const db = checksDb();
    const unknown = await createCheck(db, 'nope');
    expect(unknown.status).toBe(404);

    const sessionId = openSession(db);
    db.raw.prepare('UPDATE table_sessions SET closed_at = ? WHERE id = ?').run(Date.now(), sessionId);
    const closed = await createCheck(db, sessionId);
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as { error: string }).error).toBe('session_closed');
  });
});

describe('check patch (discount/adjustments)', () => {
  async function openCheckId(db: TestDb, sessionId: string): Promise<string> {
    const res = await createCheck(db, sessionId);
    return ((await res.json()) as { id: string }).id;
  }

  it('applies a percent discount and recomputes the total', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 2); // subtotal 1500
    const id = await openCheckId(db, sessionId);
    const res = await testRequest(`/admin/checks/${id}`, { method: 'PATCH', body: { discount: { type: 'percent', value: 10 } }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    const body = await res.json() as { subtotal: number; total: number; discount: unknown };
    expect(body.subtotal).toBe(1500);
    expect(body.total).toBe(1350);
  });

  it('replaces the adjustments list and recomputes', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 2); // 1500
    const id = await openCheckId(db, sessionId);
    const res = await testRequest(`/admin/checks/${id}`, { method: 'PATCH', body: { adjustments: [{ label: 'Service', amount: 300 }, { label: 'Coupon', amount: -200 }] }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    expect((await res.json() as { total: number }).total).toBe(1500 + 300 - 200);
  });

  it('rejects a zero-amount adjustment (400)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const id = await openCheckId(db, sessionId);
    const res = await testRequest(`/admin/checks/${id}`, { method: 'PATCH', body: { adjustments: [{ label: 'x', amount: 0 }] }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(400);
  });

  it('refuses editing a non-open check (409 not_open)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const id = await openCheckId(db, sessionId);
    db.raw.prepare("UPDATE checks SET status = 'settled' WHERE id = ?").run(id);
    const res = await testRequest(`/admin/checks/${id}`, { method: 'PATCH', body: { discount: null }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('not_open');
  });
});

describe('check settle / void', () => {
  it('settle requires and stores payment metadata, then closes the session', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const id = ((await (await createCheck(db, sessionId)).json()) as { id: string }).id;

    const missing = await testRequest(`/admin/checks/${id}/settle`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(missing.status).toBe(400);

    const res = await testRequest(`/admin/checks/${id}/settle`, { method: 'POST', body: { paymentMethod: 'card', note: 'Visa ending 42' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; settledAt: number | null; paymentMethod: string; note: string | null };
    expect(body.status).toBe('settled');
    expect(body.paymentMethod).toBe('card');
    expect(body.note).toBe('Visa ending 42');
    expect((db.raw.prepare('SELECT closed_at FROM table_sessions WHERE id = ?').get(sessionId) as { closed_at: number | null }).closed_at).not.toBeNull();
    expect((db.raw.prepare('SELECT payment_method, note FROM checks WHERE id = ?').get(id) as { payment_method: string; note: string })).toEqual({ payment_method: 'card', note: 'Visa ending 42' });
  });

  it('refuses settling a non-open check (409)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const id = ((await (await createCheck(db, sessionId)).json()) as { id: string }).id;
    await testRequest(`/admin/checks/${id}/settle`, { method: 'POST', body: { paymentMethod: 'cash' }, headers: await adminHeaders(), env: adminEnv(db) });
    const again = await testRequest(`/admin/checks/${id}/settle`, { method: 'POST', body: { paymentMethod: 'cash' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(again.status).toBe(409);
  });

  it('void leaves the session open', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const id = ((await (await createCheck(db, sessionId)).json()) as { id: string }).id;
    const res = await testRequest(`/admin/checks/${id}/void`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    expect((await res.json() as { status: string }).status).toBe('voided');
    expect((db.raw.prepare('SELECT closed_at FROM table_sessions WHERE id = ?').get(sessionId) as { closed_at: number | null }).closed_at).toBeNull();
  });
});

describe('order submit blocked by open check', () => {
  async function staffSession(db: TestDb): Promise<string> {
    const now = Date.now();
    const token = `tok-${++ipCounter}`;
    const sessionToken = `sess-tok-${ipCounter}`;
    db.raw.prepare('INSERT INTO staff_links (id, name, token, session_token, consumed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`link-${ipCounter}`, 'Marco', token, sessionToken, now, now, now);
    return sessionToken;
  }

  it('direct submit returns 409 check_open while a check is open', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const session = await staffSession(db);
    await createCheck(db, sessionId);

    const res = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: `idem-blk-${++ipCounter}`, lines: [{ entryId: 'entry-1', quantity: 1 }], tableSessionId: sessionId },
      headers: { 'X-Staff-Session': session, 'cf-connecting-ip': `10.10.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('check_open');
  });

  it('intent consume returns 409 check_open while a check is open', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    const session = await staffSession(db);
    await createCheck(db, sessionId);

    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.10.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;
    const consume = await testRequest(`/staff/order-intents/${token}/consume`, {
      method: 'POST', body: { tableSessionId: sessionId }, headers: { 'X-Staff-Session': session }, env: makeDbEnv(db),
    });
    expect(consume.status).toBe(409);
    expect(((await consume.json()) as { error: string }).error).toBe('check_open');
    // Claim released: the intent stays reusable.
    expect((db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null }).consumed_at).toBeNull();
  });
});

describe('manual admin close', () => {
  it('refuses while an open check exists (409 check_open)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1, 'served');
    await createCheck(db, sessionId);
    const res = await testRequest(`/admin/sessions/${sessionId}/close`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('check_open');
  });

  it('refuses while orders are still submitted/ready (409 active_orders)', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1, 'submitted');
    const res = await testRequest(`/admin/sessions/${sessionId}/close`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('active_orders');
  });

  it('closes when no open check and no active orders', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1, 'served');
    const res = await testRequest(`/admin/sessions/${sessionId}/close`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    expect((db.raw.prepare('SELECT closed_at FROM table_sessions WHERE id = ?').get(sessionId) as { closed_at: number | null }).closed_at).not.toBeNull();
  });
});

describe('admin table detail', () => {
  it('returns table, current session with orders + provisional total, and history', async () => {
    const db = checksDb();
    // Closed historical session with a settled check.
    const oldSession = openSession(db, 'old-sess');
    db.raw.prepare('UPDATE table_sessions SET closed_at = ? WHERE id = ?').run(Date.now() - 1000, oldSession);
    db.raw.prepare("INSERT INTO checks (id, table_session_id, status, lines, adjustments, created_at, settled_at) VALUES (?, ?, 'settled', ?, '[]', ?, ?)")
      .run('old-check', oldSession, JSON.stringify([{ name: 'X', quantity: 1, unitPrice: 500 }]), Date.now() - 900, Date.now() - 900);

    // Current open session with orders.
    const sessionId = openSession(db, 'cur-sess');
    seedOrder(db, sessionId, 'Bruschetta', 750, 2, 'submitted');
    seedOrder(db, sessionId, 'Rejected', 500, 1, 'rejected');

    const res = await testRequest('/admin/tables/table-1', { headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      table: { id: string; name: string; areaName: string | null };
      currentSession: { sessionId: string; provisionalTotal: number; check: unknown; orders: unknown[] } | null;
      history: Array<{ sessionId: string; check: { status: string; total: number } | null }>;
    };
    expect(body.table).toMatchObject({ id: 'table-1', name: '1', areaName: 'Sala' });
    expect(body.currentSession?.sessionId).toBe('cur-sess');
    expect(body.currentSession?.provisionalTotal).toBe(1500); // rejected excluded
    expect(body.currentSession?.check).toBeNull();
    expect(body.currentSession?.orders).toHaveLength(2);
    const hist = body.history.find((h) => h.sessionId === 'old-sess');
    expect(hist?.check?.status).toBe('settled');
    expect(hist?.check?.total).toBe(500);
  });

  it('404s an unknown table', async () => {
    const db = checksDb();
    const res = await testRequest('/admin/tables/nope', { headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(404);
  });
});

describe('admin table orders', () => {
  it('opens a session and appends an admin order through the shared order path', async () => {
    const db = checksDb();
    const now = Date.now();
    db.raw.prepare("INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES ('dest-k', 'Cucina', 0, ?, ?), ('dest-b', 'Bar', 1, ?, ?)").run(now, now, now, now);
    db.raw.prepare("INSERT INTO entry_destinations (entry_id, destination_id) VALUES ('entry-1', 'dest-k'), ('entry-2', 'dest-b')").run();

    const open = await testRequest('/admin/tables/table-1/session', { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(open.status).toBe(201);
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;

    const res = await testRequest(`/admin/sessions/${sessionId}/orders`, {
      method: 'POST',
      body: { lines: [{ entryId: 'entry-1', quantity: 1 }, { entryId: 'entry-2', quantity: 2 }] },
      headers: await adminHeaders(),
      env: adminEnv(db),
    });
    expect(res.status).toBe(201);
    const order = await res.json() as { ok: true; dailyNumber: number };
    expect(order.ok).toBe(true);
    expect(db.raw.prepare("SELECT actor FROM order_events").get()).toEqual({ actor: 'admin' });
    const dests = db.raw.prepare('SELECT destination_name FROM order_item_destinations ORDER BY destination_name').all() as { destination_name: string }[];
    expect(dests.map((d) => d.destination_name)).toEqual(['Bar', 'Cucina']);
  });

  it('refuses admin orders while an open check exists', async () => {
    const db = checksDb();
    const sessionId = openSession(db);
    seedOrder(db, sessionId, 'Bruschetta', 750, 1);
    await createCheck(db, sessionId);
    const res = await testRequest(`/admin/sessions/${sessionId}/orders`, {
      method: 'POST',
      body: { lines: [{ entryId: 'entry-1', quantity: 1 }] },
      headers: await adminHeaders(),
      env: adminEnv(db),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('check_open');
  });
});
