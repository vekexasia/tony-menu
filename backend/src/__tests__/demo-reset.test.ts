import { describe, it, expect } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, seedMenu, seedCategory, seedEntry } from './helpers/db';
import { resetDemoData } from '../lib/demo-reset';

describe('demo reset', () => {
  it('replaces mutable data with the demo fixture', async () => {
    const db = createTestDb();
    seedSettings(db, { name: 'Changed by visitor', publication_state: 'draft' });
    seedMenu(db, 'visitor-menu');
    seedCategory(db, 'visitor-cat');
    seedEntry(db, 'visitor-entry', 'visitor-cat', { name: 'Visitor item' });

    await resetDemoData(makeDbEnv(db, { DEMO_MODE: 'true' }));

    const settings = db.raw.prepare('SELECT name, publication_state FROM settings WHERE id = 1').get();
    const visitorEntry = db.raw.prepare('SELECT id FROM menu_entries WHERE id = ?').get('visitor-entry');
    const demoEntry = db.raw.prepare('SELECT name FROM menu_entries WHERE id = ?').get('demo-entry-ravioli');

    expect(settings).toEqual({ name: 'Trattoria Demo', publication_state: 'published' });
    expect(visitorEntry).toBeUndefined();
    expect(demoEntry).toEqual({ name: 'Ricotta and spinach ravioli' });

    // Seed adds departments, entry assignments, 10 tables, and stable demo waiters.
    const dests = db.raw.prepare('SELECT name FROM order_destinations ORDER BY sort_order').all() as { name: string }[];
    expect(dests.map((d) => d.name)).toEqual(['Cucina', 'Bar']);
    const tableCount = db.raw.prepare('SELECT count(*) c FROM tables').get() as { c: number };
    expect(tableCount.c).toBe(10);
    const waiter = db.raw.prepare("SELECT name, token, session_token, consumed_at FROM staff_links WHERE id = 'demo-staff-marco'").get() as { name: string; token: string; session_token: string | null; consumed_at: number | null };
    expect(waiter).toEqual({ name: 'Marco Demo', token: 'demo-staff-link-marco', session_token: null, consumed_at: null });
    const barGlass = db.raw.prepare("SELECT destination_id FROM entry_destinations WHERE entry_id = 'demo-entry-prosecco'").get() as { destination_id: string };
    expect(barGlass.destination_id).toBe('demo-dest-bar');
  });

  it('wipes ordering data (orders, intents, destinations) on reset', async () => {
    const db = createTestDb();
    seedSettings(db);
    seedCategory(db, 'visitor-cat');
    seedEntry(db, 'visitor-entry', 'visitor-cat');
    const now = Date.now();
    db.raw.prepare("INSERT INTO order_destinations (id, name, sort_order, created_at, updated_at) VALUES ('dest-1', 'Kitchen', 0, ?, ?)").run(now, now);
    db.raw.prepare("INSERT INTO entry_destinations (entry_id, destination_id) VALUES ('visitor-entry', 'dest-1')").run();
    db.raw.prepare("INSERT INTO orders (id, order_day, daily_number, status, idempotency_key, created_at, updated_at) VALUES ('ord-1', 20260703, 1, 'submitted', 'ik-1', ?, ?)").run(now, now);
    db.raw.prepare("INSERT INTO order_items (id, order_id, entry_id, name, price, quantity, created_at) VALUES ('oi-1', 'ord-1', 'visitor-entry', 'Test', 1000, 1, ?)").run(now);
    db.raw.prepare("INSERT INTO order_item_destinations (id, order_item_id, destination_id, destination_name, created_at) VALUES ('oid-1', 'oi-1', 'dest-1', 'Kitchen', ?)").run(now);
    db.raw.prepare("INSERT INTO order_intents (id, lines, expires_at, created_at) VALUES ('int-1', '[]', ?, ?)").run(now + 60000, now);

    await resetDemoData(makeDbEnv(db, { DEMO_MODE: 'true' }));

    // The visitor's transactional rows are gone; showcase rows replace them
    // (this env has no E2E_MODE, so the showcase is seeded).
    expect(db.raw.prepare("SELECT count(*) c FROM orders WHERE id = 'ord-1'").get()).toEqual({ c: 0 });
    expect(db.raw.prepare("SELECT count(*) c FROM order_items WHERE id = 'oi-1'").get()).toEqual({ c: 0 });
    expect(db.raw.prepare("SELECT count(*) c FROM order_item_destinations WHERE id = 'oid-1'").get()).toEqual({ c: 0 });
    expect(db.raw.prepare("SELECT count(*) c FROM order_intents").get()).toEqual({ c: 0 });
    expect((db.raw.prepare('SELECT count(*) c FROM orders').get() as { c: number }).c).toBeGreaterThan(0);
    // Destinations/assignments are wiped then re-seeded from the demo fixture:
    // the visitor's rows are gone, the seed's Cucina/Bar are present.
    const dests = db.raw.prepare('SELECT id FROM order_destinations ORDER BY sort_order').all() as { id: string }[];
    expect(dests.map((d) => d.id)).toEqual(['demo-dest-cucina', 'demo-dest-bar']);
    expect(db.raw.prepare("SELECT count(*) c FROM entry_destinations WHERE destination_id = 'dest-1'").get()).toEqual({ c: 0 });
  });

  it('exposes a demo-only reset endpoint', async () => {
    const db = createTestDb();
    seedSettings(db);

    const prodRes = await testRequest('/admin/demo/reset', {
      method: 'POST',
      env: makeDbEnv(db, { DEMO_MODE: 'false', ADMIN_EMAILS: 'admin' }),
    });
    expect(prodRes.status).toBe(401);

    const demoRes = await testRequest('/admin/demo/reset', {
      method: 'POST',
      env: makeDbEnv(db, { DEMO_MODE: 'true' }),
    });
    expect(demoRes.status).toBe(200);
  });

  it('seeds the showcase (live table + settled history) when E2E_MODE is off', async () => {
    const db = createTestDb();
    seedSettings(db);
    await resetDemoData(makeDbEnv(db, { DEMO_MODE: 'true' }));

    // Live table: sala-2 has an open session with 2 orders (submitted + ready).
    const live = db.raw.prepare("SELECT id FROM table_sessions WHERE table_id = 'demo-table-sala-2' AND closed_at IS NULL").all() as { id: string }[];
    expect(live).toHaveLength(1);
    const liveOrders = db.raw.prepare('SELECT status FROM orders WHERE table_session_id = ? ORDER BY created_at').all(live[0].id) as { status: string }[];
    expect(liveOrders.map((o) => o.status)).toEqual(['submitted', 'ready']);
    // Live items span both destinations.
    const liveDests = db.raw.prepare("SELECT DISTINCT oid.destination_id d FROM order_item_destinations oid JOIN order_items oi ON oi.id = oid.order_item_id JOIN orders o ON o.id = oi.order_id WHERE o.table_session_id = ?").all(live[0].id) as { d: string }[];
    expect(liveDests.map((r) => r.d).sort()).toEqual(['demo-dest-bar', 'demo-dest-cucina']);

    // Every table has 4 closed sessions, each with a settled check (Sala 2 also has its live session).
    const closed = db.raw.prepare("SELECT table_id, count(*) c FROM table_sessions WHERE closed_at IS NOT NULL GROUP BY table_id").all() as { table_id: string; c: number }[];
    expect(closed).toHaveLength(10);
    for (const row of closed) expect(row.c, row.table_id).toBe(4);
    const settled = db.raw.prepare("SELECT count(*) c FROM checks WHERE status = 'settled'").get() as { c: number };
    expect(settled.c).toBe(40);

    // Daily numbers are unique per order_day.
    const clash = db.raw.prepare('SELECT order_day, count(*) c, count(DISTINCT daily_number) d FROM orders GROUP BY order_day HAVING c != d').all();
    expect(clash).toHaveLength(0);

    // Today has exactly the 2 live orders.
    const d = new Date();
    const today = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const todayCount = db.raw.prepare('SELECT count(*) c FROM orders WHERE order_day = ?').get(today) as { c: number };
    expect(todayCount.c).toBe(2);
  });

  it('skips the showcase when E2E_MODE is true', async () => {
    const db = createTestDb();
    seedSettings(db);
    await resetDemoData(makeDbEnv(db, { DEMO_MODE: 'true', E2E_MODE: 'true' }));

    for (const table of ['orders', 'table_sessions', 'checks']) {
      const { c } = db.raw.prepare(`SELECT count(*) c FROM ${table}`).get() as { c: number };
      expect(c, table).toBe(0);
    }
  });
});
