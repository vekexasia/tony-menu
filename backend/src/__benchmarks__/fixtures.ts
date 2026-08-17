/**
 * Shared fixtures for the backend benchmarks.
 *
 * The in-memory D1 shim from the test helpers is reused so the benchmarks
 * exercise exactly the same code path as the integration tests: real SQL
 * against SQLite, real drizzle queries, real Hono routing.
 *
 * Everything is deterministic (fixed ids, fixed prices, fixed timestamps) so
 * that instruction counts are comparable from one run to the next.
 */

import { createTestDb, makeDbEnv, type TestDb } from '../__tests__/helpers/db';
import type { Env } from '../types';

export const BENCH_NOW = 1_700_000_000_000;

/**
 * The request logger writes one JSON line per request. Thousands of benchmark
 * iterations would drown the report, so route it to a no-op: what we want to
 * measure is request handling, not terminal I/O.
 */
export function silenceRequestLogger(): void {
  console.log = () => {};
}

export interface BenchCatalogOptions {
  menus?: number;
  categories?: number;
  entriesPerCategory?: number;
  locales?: string[];
}

/**
 * Seed a restaurant of realistic size: 3 menus, 12 categories, 25 entries per
 * category (300 dishes), each translated into 3 locales and tagged with labels
 * and order destinations.
 */
export function seedBenchRestaurant(options: BenchCatalogOptions = {}): TestDb {
  const {
    menus = 3,
    categories = 12,
    entriesPerCategory = 25,
    locales = ['en', 'de', 'fr'],
  } = options;

  const db = createTestDb();
  const raw = db.raw;
  const now = BENCH_NOW;

  const i18nFor = (name: string, description: string) =>
    JSON.stringify(
      Object.fromEntries(
        locales.map((locale) => [locale, { name: `${name} (${locale})`, description: `${description} (${locale})` }]),
      ),
    );

  raw.prepare(
    `UPDATE settings
        SET name = ?, publication_state = 'published', ai_chat_enabled = 1, updated_at = ?
      WHERE id = 1`,
  ).run('Trattoria Bench', now);

  const insertMenu = raw.prepare(
    `INSERT INTO menus (id, code, title, i18n, published, sort_order, icon, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, 'utensils', ?, ?)`,
  );
  const insertCategory = raw.prepare(
    `INSERT INTO menu_categories (id, name, i18n, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertEntry = raw.prepare(
    `INSERT INTO menu_entries
       (id, category_id, name, description, price, price_unit, image_url, allergens, i18n,
        sort_order, hidden, out_of_stock, frozen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertMembership = raw.prepare(
    `INSERT OR IGNORE INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)`,
  );
  const insertLabel = raw.prepare(
    `INSERT INTO labels (id, name, color, i18n, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEntryLabel = raw.prepare(
    `INSERT OR IGNORE INTO entry_labels (entry_id, label_id) VALUES (?, ?)`,
  );

  const seed = raw.transaction(() => {
    for (let m = 0; m < menus; m++) {
      insertMenu.run(`menu-${m}`, `menu-code-${m}`, `Menu ${m}`, i18nFor(`Menu ${m}`, `Menu ${m}`), m, now, now);
    }

    const labelCount = 8;
    const colors = ['primary', 'green', 'amber', 'red', 'gray'];
    for (let l = 0; l < labelCount; l++) {
      insertLabel.run(`label-${l}`, `Label ${l}`, colors[l % colors.length], i18nFor(`Label ${l}`, `Label ${l}`), l, now, now);
    }

    for (let c = 0; c < categories; c++) {
      insertCategory.run(`cat-${c}`, `Category ${c}`, i18nFor(`Category ${c}`, `Category ${c}`), c, now, now);

      for (let e = 0; e < entriesPerCategory; e++) {
        const entryId = `entry-${c}-${e}`;
        const name = `Dish ${c}-${e}`;
        const description = `A generously described plate number ${e} from category ${c}`;
        insertEntry.run(
          entryId,
          `cat-${c}`,
          name,
          description,
          500 + ((c * entriesPerCategory + e) % 40) * 125,
          e % 7 === 0 ? 'kg' : null,
          e % 3 === 0 ? `https://cdn.example.com/img/${c}-${e}.webp` : null,
          e % 4 === 0 ? JSON.stringify(['gluten', 'milk']) : null,
          i18nFor(name, description),
          e,
          e % 17 === 0 ? 1 : 0,
          e % 11 === 0 ? 1 : 0,
          e % 13 === 0 ? 1 : 0,
          now,
          now,
        );
        insertMembership.run(`menu-${e % menus}`, entryId);
        insertEntryLabel.run(entryId, `label-${e % labelCount}`);
        insertEntryLabel.run(entryId, `label-${(e + 3) % labelCount}`);
      }
    }
  });
  seed();

  return db;
}

export function benchEnv(db: TestDb, overrides: Partial<Env> = {}): Env {
  return makeDbEnv(db, overrides);
}
