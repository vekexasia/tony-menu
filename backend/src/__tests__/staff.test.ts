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

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';
let ipCounter = 0;

const WAITER_MODULES = JSON.stringify({
  ordering: { enabled: true, mode: 'send', submitMode: 'both' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
});

function staffDb(): TestDb {
  const db = createTestDb();
  seedSettings(db, { modules: WAITER_MODULES });
  seedCategory(db, 'cat-1');
  seedEntry(db, 'entry-1', 'cat-1', { name: 'Bruschetta', price: 750 });
  seedEntry(db, 'entry-2', 'cat-1', { name: 'Pasta', price: 1200 });
  return db;
}

function adminEnv(db: TestDb) {
  return makeDbEnv(db, { ADMIN_EMAILS: ADMIN_UID });
}

async function adminHeaders() {
  return { 'Cf-Access-Jwt-Assertion': await signTestJwt(ADMIN_UID) };
}

/** Create a named link (admin) and return its one-use token. */
async function createLink(db: TestDb, name = 'Marco'): Promise<string> {
  const res = await testRequest('/admin/staff-links', {
    method: 'POST',
    body: { name },
    headers: await adminHeaders(),
    env: adminEnv(db),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

/** Consume a token into a live session token. */
async function openSession(db: TestDb, token: string): Promise<string> {
  const res = await testRequest('/staff/consume', {
    method: 'POST',
    body: { token },
    headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` },
    env: makeDbEnv(db),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { sessionToken: string }).sessionToken;
}

function staffHeaders(sessionToken: string) {
  return { 'X-Staff-Session': sessionToken };
}

async function seedArea(db: TestDb, id = 'area-1', name = 'Sala', sortOrder = 0) {
  const now = Date.now();
  db.raw.prepare('INSERT INTO areas (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, name, sortOrder, now, now);
}

async function seedTable(db: TestDb, id = 'table-1', name = 'Table 1', areaId: string | null = null) {
  const now = Date.now();
  db.raw.prepare('INSERT INTO tables (id, name, active, sort_order, area_id, x, y, shape, created_at, updated_at) VALUES (?, ?, 1, 0, ?, 25, 25, ?, ?, ?)').run(id, name, areaId, 'rect', now, now);
}

describe('one-use staff link exchange', () => {
  it('exchanges a token for a session exactly once; second attempt fails', async () => {
    const db = staffDb();
    const token = await createLink(db);

    const first = await testRequest('/staff/consume', {
      method: 'POST', body: { token }, headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    expect(first.status).toBe(200);
    const body = await first.json() as { ok: boolean; sessionToken: string; name: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('Marco');
    expect(body.sessionToken).toBeTruthy();

    const second = await testRequest('/staff/consume', {
      method: 'POST', body: { token }, headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe('consumed');
  });

  it('keeps seeded demo waiter links one-use', async () => {
    const db = staffDb();
    const now = Date.now();
    db.raw.prepare('INSERT INTO staff_links (id, name, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('demo-staff-marco', 'Marco Demo', 'demo-staff-link-marco', now, now);

    const first = await testRequest('/staff/consume', {
      method: 'POST', body: { token: 'demo-staff-link-marco' }, headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` }, env: makeDbEnv(db, { DEMO_MODE: 'true' }),
    });
    expect(first.status).toBe(200);

    const second = await testRequest('/staff/consume', {
      method: 'POST', body: { token: 'demo-staff-link-marco' }, headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` }, env: makeDbEnv(db, { DEMO_MODE: 'true' }),
    });
    expect(second.status).toBe(409);
    expect(((await second.json()) as { error: string }).error).toBe('consumed');
  });

  it('404s an unknown token', async () => {
    const db = staffDb();
    const res = await testRequest('/staff/consume', {
      method: 'POST', body: { token: 'nope' }, headers: { 'cf-connecting-ip': `10.2.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    expect(res.status).toBe(404);
  });
});

describe('staff session middleware', () => {
  it('rejects requests without a session token', async () => {
    const db = staffDb();
    const res = await testRequest('/staff/floor', { env: makeDbEnv(db) });
    expect(res.status).toBe(401);
  });

  it('accepts a valid session token', async () => {
    const db = staffDb();
    const session = await openSession(db, await createLink(db));
    const res = await testRequest('/staff/session', { headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Marco');
  });

  it('revocation kills the session immediately, even after consume', async () => {
    const db = staffDb();
    const token = await createLink(db);
    const session = await openSession(db, token);

    // Session works before revoke.
    expect((await testRequest('/staff/floor', { headers: staffHeaders(session), env: makeDbEnv(db) })).status).toBe(200);

    const id = (db.raw.prepare('SELECT id FROM staff_links WHERE token = ?').get(token) as { id: string }).id;
    const revoke = await testRequest(`/admin/staff-links/${id}/revoke`, { method: 'POST', headers: await adminHeaders(), env: adminEnv(db) });
    expect(revoke.status).toBe(200);

    const after = await testRequest('/staff/floor', { headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(after.status).toBe(401);
  });
});

describe('table sessions open/close', () => {
  it('opens a session and returns the same one on re-open', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));

    const open1 = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(open1.status).toBe(201);
    const s1 = ((await open1.json()) as { sessionId: string }).sessionId;

    const open2 = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(open2.status).toBe(200);
    expect(((await open2.json()) as { sessionId: string }).sessionId).toBe(s1);
  });

  it('blocks close while orders are still submitted/ready, allows it once served', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;

    // Submit an order into the session via the shared direct-submit path.
    const submit = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: 'idem-close-1', lines: [{ entryId: 'entry-1', quantity: 1 }], tableSessionId: sessionId },
      headers: { ...staffHeaders(session), 'cf-connecting-ip': `10.3.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    expect(submit.status).toBe(200);
    const orderId = ((await submit.json()) as { orderId: string }).orderId;

    const blocked = await testRequest(`/staff/sessions/${sessionId}/close`, { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: string }).error).toBe('pending_orders');

    // Move to ready then served.
    db.raw.prepare("UPDATE orders SET status = 'served' WHERE id = ?").run(orderId);
    const ok = await testRequest(`/staff/sessions/${sessionId}/close`, { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(ok.status).toBe(200);
    expect((db.raw.prepare('SELECT closed_at FROM table_sessions WHERE id = ?').get(sessionId) as { closed_at: number | null }).closed_at).not.toBeNull();
  });
});

describe('tableSessionId on submit paths', () => {
  it('accepts a valid session on direct submit', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;

    const submit = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: 'idem-direct-1', lines: [{ entryId: 'entry-1', quantity: 2 }], tableSessionId: sessionId },
      headers: { ...staffHeaders(session), 'cf-connecting-ip': `10.3.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    expect(submit.status).toBe(200);
    const orderId = ((await submit.json()) as { orderId: string }).orderId;
    expect((db.raw.prepare('SELECT table_session_id FROM orders WHERE id = ?').get(orderId) as { table_session_id: string }).table_session_id).toBe(sessionId);
  });

  it('accepts a valid session on intent consume', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;

    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.3.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;

    const consume = await testRequest(`/staff/order-intents/${token}/consume`, {
      method: 'POST', body: { tableSessionId: sessionId }, headers: staffHeaders(session), env: makeDbEnv(db),
    });
    expect(consume.status).toBe(200);
    const orderId = ((await consume.json()) as { orderId: string }).orderId;
    expect((db.raw.prepare('SELECT table_session_id FROM orders WHERE id = ?').get(orderId) as { table_session_id: string }).table_session_id).toBe(sessionId);
  });

  it('rejects an invalid or closed table session (409) on direct submit', async () => {
    const db = staffDb();
    const session = await openSession(db, await createLink(db));
    const res = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: 'idem-bad-0001', lines: [{ entryId: 'entry-1', quantity: 1 }], tableSessionId: 'does-not-exist' },
      headers: { ...staffHeaders(session), 'cf-connecting-ip': `10.3.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_table_session');
  });
});

describe('ready -> served staff transition', () => {
  async function submittedOrder(db: TestDb, sessionId: string, session: string): Promise<string> {
    const submit = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: `idem-serve-${++ipCounter}`, lines: [{ entryId: 'entry-1', quantity: 1 }], tableSessionId: sessionId },
      headers: { ...staffHeaders(session), 'cf-connecting-ip': `10.4.0.${ipCounter}` },
      env: makeDbEnv(db),
    });
    return ((await submit.json()) as { orderId: string }).orderId;
  }

  it('serves a ready order but refuses other transitions', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const orderId = await submittedOrder(db, sessionId, session);

    // submitted -> served is illegal for staff.
    const early = await testRequest(`/staff/orders/${orderId}/serve`, { method: 'PATCH', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(early.status).toBe(409);
    expect(((await early.json()) as { error: string }).error).toBe('illegal_transition');

    // Kitchen marks it ready; now staff can serve.
    db.raw.prepare("UPDATE orders SET status = 'ready' WHERE id = ?").run(orderId);
    const ok = await testRequest(`/staff/orders/${orderId}/serve`, { method: 'PATCH', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(ok.status).toBe(200);
    expect((db.raw.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as { status: string }).status).toBe('served');

    // Serving an already-served order is illegal too.
    const again = await testRequest(`/staff/orders/${orderId}/serve`, { method: 'PATCH', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(again.status).toBe(409);
  });

  it('logs the lifecycle changelog with the right actors', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const orderId = await submittedOrder(db, sessionId, session);

    db.raw.prepare("UPDATE orders SET status = 'ready' WHERE id = ?").run(orderId);
    await testRequest(`/staff/orders/${orderId}/serve`, { method: 'PATCH', headers: staffHeaders(session), env: makeDbEnv(db) });

    const events = db.raw.prepare('SELECT status, actor, actor_name FROM order_events WHERE order_id = ? ORDER BY created_at').all(orderId) as Array<{ status: string; actor: string; actor_name: string | null }>;
    expect(events.map((e) => e.status)).toEqual(['submitted', 'served']);
    expect(events.map((e) => e.actor)).toEqual(['staff', 'staff']);
    expect(events.map((e) => e.actor_name)).toEqual(['Marco', 'Marco']);

    // The session detail exposes them.
    const detail = await testRequest(`/staff/sessions/${sessionId}`, { headers: staffHeaders(session), env: makeDbEnv(db) });
    const body = (await detail.json()) as { orders: Array<{ events: Array<{ status: string; actor: string | null; actorName: string | null }> }> };
    expect(body.orders[0].events.map((e) => e.status)).toEqual(['submitted', 'served']);
    expect(body.orders[0].events.map((e) => e.actorName)).toEqual(['Marco', 'Marco']);
  });

  it('QR consume requires a table and logs actor staff, diner direct submit logs diner', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.6.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;
    const missingTable = await testRequest(`/staff/order-intents/${token}/consume`, { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(missingTable.status).toBe(400);
    expect((db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null }).consumed_at).toBeNull();

    const consume = await testRequest(`/staff/order-intents/${token}/consume`, { method: 'POST', body: { tableSessionId: sessionId }, headers: staffHeaders(session), env: makeDbEnv(db) });
    const staffOrderId = ((await consume.json()) as { orderId: string }).orderId;
    const staffEvent = db.raw.prepare('SELECT actor, actor_name FROM order_events WHERE order_id = ?').get(staffOrderId) as { actor: string; actor_name: string | null };
    expect(staffEvent.actor).toBe('staff');
    expect(staffEvent.actor_name).toBe('Marco');

    const direct = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: `idem-diner-${++ipCounter}`, lines: [{ entryId: 'entry-1', quantity: 1 }] },
      headers: { 'cf-connecting-ip': `10.6.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    const dinerOrderId = ((await direct.json()) as { orderId: string }).orderId;
    const dinerEvent = db.raw.prepare('SELECT actor FROM order_events WHERE order_id = ?').get(dinerOrderId) as { actor: string };
    expect(dinerEvent.actor).toBe('diner');
  });
});

describe('staff order-intents gating', () => {
  it('review + consume require a staff session', async () => {
    const db = staffDb();
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.5.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;

    expect((await testRequest(`/staff/order-intents/${token}`, { env: makeDbEnv(db) })).status).toBe(401);
    expect((await testRequest(`/staff/order-intents/${token}/consume`, { method: 'POST', env: makeDbEnv(db) })).status).toBe(401);
  });

  it('reviews and consumes with a staff session and selected table', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 3 }] }, headers: { 'cf-connecting-ip': `10.5.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;

    const review = await testRequest(`/staff/order-intents/${token}`, { headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(review.status).toBe(200);
    expect(((await review.json()) as { status: string }).status).toBe('pending');

    const consume = await testRequest(`/staff/order-intents/${token}/consume`, { method: 'POST', body: { tableSessionId: sessionId }, headers: staffHeaders(session), env: makeDbEnv(db) });
    expect(consume.status).toBe(200);
    const orderId = ((await consume.json()) as { orderId: string }).orderId;
    expect((db.raw.prepare('SELECT table_session_id FROM orders WHERE id = ?').get(orderId) as { table_session_id: string | null }).table_session_id).toBe(sessionId);
  });

  it('consumes with a lines override, creating the edited order (not the frozen snapshot)', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.5.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;

    // Waiter edits: bump entry-1 to 3 and add entry-2.
    const consume = await testRequest(`/staff/order-intents/${token}/consume`, {
      method: 'POST',
      body: { tableSessionId: sessionId, lines: [{ entryId: 'entry-1', quantity: 3 }, { entryId: 'entry-2', quantity: 2 }] },
      headers: staffHeaders(session),
      env: makeDbEnv(db),
    });
    expect(consume.status).toBe(200);
    const orderId = ((await consume.json()) as { orderId: string }).orderId;
    const items = db.raw.prepare('SELECT entry_id, quantity FROM order_items WHERE order_id = ? ORDER BY entry_id').all(orderId) as { entry_id: string; quantity: number }[];
    expect(items).toEqual([{ entry_id: 'entry-1', quantity: 3 }, { entry_id: 'entry-2', quantity: 2 }]);
  });

  it('rejects a lines override with a stale (hidden) item as 409 stale_items, leaving the intent reusable', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    db.raw.prepare("UPDATE menu_entries SET hidden = 1 WHERE id = 'entry-2'").run();
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.5.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;

    const consume = await testRequest(`/staff/order-intents/${token}/consume`, {
      method: 'POST',
      body: { tableSessionId: sessionId, lines: [{ entryId: 'entry-1', quantity: 1 }, { entryId: 'entry-2', quantity: 1 }] },
      headers: staffHeaders(session),
      env: makeDbEnv(db),
    });
    expect(consume.status).toBe(409);
    expect(((await consume.json()) as { error: string; staleEntryIds: string[] })).toEqual({ error: 'stale_items', staleEntryIds: ['entry-2'] });
    // Claim released: the intent can be reviewed/edited again.
    expect((db.raw.prepare('SELECT consumed_at FROM order_intents WHERE id = ?').get(token) as { consumed_at: number | null }).consumed_at).toBeNull();
  });

  it('rejects a malformed lines override (400)', async () => {
    const db = staffDb();
    await seedTable(db);
    const session = await openSession(db, await createLink(db));
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const intentRes = await testRequest('/orders/intents', {
      method: 'POST', body: { lines: [{ entryId: 'entry-1', quantity: 1 }] }, headers: { 'cf-connecting-ip': `10.5.0.${++ipCounter}` }, env: makeDbEnv(db),
    });
    const token = ((await intentRes.json()) as { token: string }).token;
    const consume = await testRequest(`/staff/order-intents/${token}/consume`, {
      method: 'POST',
      body: { tableSessionId: sessionId, lines: [{ entryId: 'entry-1', quantity: 0 }] },
      headers: staffHeaders(session),
      env: makeDbEnv(db),
    });
    expect(consume.status).toBe(400);
  });
});

describe('areas CRUD (admin, #15)', () => {
  it('creates, lists, renames, and deletes an area', async () => {
    const db = staffDb();
    const create = await testRequest('/admin/areas', { method: 'POST', body: { name: 'Terrazza' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(create.status).toBe(201);
    const id = ((await create.json()) as { id: string }).id;

    const list = await testRequest('/admin/areas', { headers: await adminHeaders(), env: adminEnv(db) });
    expect(((await list.json()) as { areas: Array<{ id: string; name: string }> }).areas).toEqual([{ id, name: 'Terrazza', sortOrder: 0 }]);

    const rename = await testRequest(`/admin/areas/${id}`, { method: 'PUT', body: { name: 'Sala' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(rename.status).toBe(200);
    expect((db.raw.prepare('SELECT name FROM areas WHERE id = ?').get(id) as { name: string }).name).toBe('Sala');

    const del = await testRequest(`/admin/areas/${id}`, { method: 'DELETE', headers: await adminHeaders(), env: adminEnv(db) });
    expect(del.status).toBe(200);
    expect(db.raw.prepare('SELECT id FROM areas WHERE id = ?').get(id)).toBeUndefined();
  });

  it('blocks deleting an area that still has tables (409 has_tables)', async () => {
    const db = staffDb();
    await seedArea(db, 'area-1');
    await seedTable(db, 'table-1', 'Table 1', 'area-1');
    const del = await testRequest('/admin/areas/area-1', { method: 'DELETE', headers: await adminHeaders(), env: adminEnv(db) });
    expect(del.status).toBe(409);
    expect(((await del.json()) as { error: string }).error).toBe('has_tables');
    expect(db.raw.prepare('SELECT id FROM areas WHERE id = ?').get('area-1')).toBeDefined();
  });
});

describe('tables area + position (admin, #15)', () => {
  it('requires a valid area on create (400 invalid_area)', async () => {
    const db = staffDb();
    const res = await testRequest('/admin/tables', { method: 'POST', body: { name: '1', areaId: 'nope', shape: 'rect' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_area');
  });

  it('stores area + shape on create and exposes them on list', async () => {
    const db = staffDb();
    await seedArea(db, 'area-1');
    const create = await testRequest('/admin/tables', { method: 'POST', body: { name: '1', areaId: 'area-1', shape: 'circle' }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(create.status).toBe(201);
    const id = ((await create.json()) as { id: string }).id;
    const list = await testRequest('/admin/tables', { headers: await adminHeaders(), env: adminEnv(db) });
    const row = ((await list.json()) as { tables: Array<{ id: string; areaId: string; shape: string; x: number; y: number }> }).tables.find((r) => r.id === id)!;
    expect(row).toMatchObject({ areaId: 'area-1', shape: 'circle', x: 25, y: 25 });
  });

  it('updates a table position via PATCH', async () => {
    const db = staffDb();
    await seedArea(db, 'area-1');
    await seedTable(db, 'table-1', '1', 'area-1');
    const res = await testRequest('/admin/tables/table-1/position', { method: 'PATCH', body: { x: 500, y: 300 }, headers: await adminHeaders(), env: adminEnv(db) });
    expect(res.status).toBe(200);
    expect(db.raw.prepare('SELECT x, y FROM tables WHERE id = ?').get('table-1')).toEqual({ x: 500, y: 300 });
  });
});

describe('/staff/floor payload (#15)', () => {
  it('returns areas plus tables with x/y/shape and the submitted-order lifecycle', async () => {
    const db = staffDb();
    await seedArea(db, 'area-1', 'Sala', 0);
    await seedTable(db, 'table-1', '1', 'area-1');
    const session = await openSession(db, await createLink(db));

    // No open session yet: gray, no oldestSubmittedAt.
    let res = await testRequest('/staff/floor', { headers: staffHeaders(session), env: makeDbEnv(db) });
    let body = (await res.json()) as { areas: Array<{ id: string; name: string }>; tables: Array<{ id: string; x: number; y: number; shape: string; oldestSubmittedAt: number | null; sessionId: string | null }> };
    expect(body.areas).toEqual([{ id: 'area-1', name: 'Sala', sortOrder: 0 }]);
    const t0 = body.tables.find((t) => t.id === 'table-1')!;
    expect(t0).toMatchObject({ shape: 'rect', x: 25, y: 25, sessionId: null, oldestSubmittedAt: null });

    // Open a session and submit an order: oldestSubmittedAt is set.
    const open = await testRequest('/staff/tables/table-1/session', { method: 'POST', headers: staffHeaders(session), env: makeDbEnv(db) });
    const sessionId = ((await open.json()) as { sessionId: string }).sessionId;
    const submit = await testRequest('/orders', {
      method: 'POST',
      body: { idempotencyKey: `idem-floor-${++ipCounter}`, lines: [{ entryId: 'entry-1', quantity: 1 }], tableSessionId: sessionId },
      headers: { ...staffHeaders(session), 'cf-connecting-ip': `10.7.0.${++ipCounter}` },
      env: makeDbEnv(db),
    });
    const orderId = ((await submit.json()) as { orderId: string }).orderId;

    res = await testRequest('/staff/floor', { headers: staffHeaders(session), env: makeDbEnv(db) });
    body = (await res.json()) as typeof body;
    expect(body.tables.find((t) => t.id === 'table-1')!.oldestSubmittedAt).toEqual(expect.any(Number));

    // Mark ready: no longer 'submitted', so oldestSubmittedAt drops back to null.
    db.raw.prepare("UPDATE orders SET status = 'ready' WHERE id = ?").run(orderId);
    res = await testRequest('/staff/floor', { headers: staffHeaders(session), env: makeDbEnv(db) });
    body = (await res.json()) as typeof body;
    expect(body.tables.find((t) => t.id === 'table-1')!.oldestSubmittedAt).toBeNull();
  });
});
