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

    for (const table of ['orders', 'order_items', 'order_item_destinations', 'order_intents', 'order_destinations', 'entry_destinations']) {
      const { c } = db.raw.prepare(`SELECT count(*) c FROM ${table}`).get() as { c: number };
      expect(c, table).toBe(0);
    }
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
});
