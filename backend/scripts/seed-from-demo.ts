#!/usr/bin/env tsx
/**
 * Demo API → Local D1 Seed Script
 *
 * Fetches the public catalog from the live demo API and seeds it into the
 * local dev D1 database. Run this once after clearing wrangler state to get
 * a realistic dataset to work with locally.
 *
 * Also applies any missing migration columns so the script is idempotent
 * even against a fresh/partially-migrated local DB.
 *
 * Usage:
 *   npm run seed:demo            # apply to local D1
 *   npm run seed:demo -- --dry-run
 *
 * NOTE: wrangler dev must be stopped before running this script.
 * The script writes directly to the miniflare SQLite file that wrangler dev
 * uses, which is different from the file targeted by `wrangler d1 execute`.
 */

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';

const DEMO_API = 'https://api.tonymenu.app';
const D1_STATE_DIR = path.resolve(
  import.meta.dirname,
  '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
);
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Demo API → Local D1 Seed');
  console.log(`  Source: ${DEMO_API}/catalog`);
  if (DRY_RUN) console.log('  ⚠️  DRY RUN — fetching only, no writes');
  console.log('═══════════════════════════════════════════════════\n');

  // Find the active miniflare SQLite file (largest non-metadata file = most data)
  const files = readdirSync(D1_STATE_DIR)
    .filter((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
    .map((f) => path.join(D1_STATE_DIR, f));

  if (files.length === 0) {
    console.error('No miniflare SQLite files found in', D1_STATE_DIR);
    console.error('Start wrangler dev once first, then stop it, then run this script.');
    process.exit(1);
  }

  console.log(`📥 Fetching demo catalog...`);
  const res = await fetch(`${DEMO_API}/catalog`);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const catalog = (await res.json()) as {
    restaurant: Record<string, unknown>;
    menus: Record<string, unknown>[];
    categories: Array<{ entries: Record<string, unknown>[] } & Record<string, unknown>>;
    variants: Record<string, unknown>[];
    extras: Record<string, unknown>[];
  };

  const totalEntries = catalog.categories.reduce((n, c) => n + c.entries.length, 0);
  console.log(
    `   ${catalog.menus.length} menus, ${catalog.categories.length} categories, ${totalEntries} entries`,
  );
  console.log(`   ${catalog.variants.length} variants, ${catalog.extras.length} extras\n`);

  if (DRY_RUN) {
    console.log('DRY RUN complete — no writes performed.');
    return;
  }

  // Write catalog to a JSON temp file, then run a Python script that reads it.
  // Python is used for SQLite writes because tsx can't reliably import better-sqlite3.
  // Catalog goes through a file (not inline string) to avoid quoting/escaping issues.
  const { writeFileSync, unlinkSync } = await import('fs');
  const tmpJson = path.resolve(import.meta.dirname, '../tmp-seed-demo.json');
  const tmpPy   = path.resolve(import.meta.dirname, '../tmp-seed-demo.py');
  writeFileSync(tmpJson, JSON.stringify(catalog), 'utf-8');
  writeFileSync(tmpPy, buildPythonSeed(files, tmpJson), 'utf-8');

  try {
    console.log('🚀 Applying migrations + seed to local D1...');
    execSync(`python3 ${tmpPy}`, { stdio: 'inherit' });
  } finally {
    for (const f of [tmpJson, tmpPy]) try { unlinkSync(f); } catch { /* ignore */ }
  }

  console.log('\n✅ Done. Restart wrangler dev to pick up the changes.');
}

function buildPythonSeed(files: string[], catalogJsonPath: string): string {
  const fileList = JSON.stringify(files);
  const jsonPath = JSON.stringify(catalogJsonPath);
  return `
import sqlite3, json, os

FILES = ${fileList}
with open(${jsonPath}, 'r') as f:
    CATALOG = json.load(f)

def col_exists(conn, table, col):
    return any(r[1]==col for r in conn.execute(f'PRAGMA table_info({table})'))

def table_exists(conn, t):
    return bool(conn.execute(f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{t}'").fetchone())

def has_settings(conn):
    try:
        conn.execute('SELECT id FROM settings LIMIT 1')
        return True
    except:
        return False

# Find file(s) that have the settings table (= the active DB used by wrangler dev)
targets = [f for f in FILES if has_settings(sqlite3.connect(f))]
if not targets:
    print('ERROR: no miniflare SQLite file with settings table found')
    exit(1)

print(f'Targets: {len(targets)} file(s)')

restaurant = CATALOG['restaurant']
menus = CATALOG['menus']
categories = CATALOG['categories']
variants = CATALOG['variants']
extras = CATALOG['extras']
now = 1746276000000

for db_path in targets:
    print(f'  Writing to {os.path.basename(db_path)}...')
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA foreign_keys=OFF')

    # Migration 0001: remove menu_id from menu_categories
    if col_exists(conn, 'menu_categories', 'menu_id'):
        print('    Migrating menu_categories...')
        conn.execute("""CREATE TABLE __new_menu_categories (
            id text PRIMARY KEY NOT NULL, name text NOT NULL,
            sort_order integer DEFAULT 0 NOT NULL, i18n text,
            created_at integer NOT NULL, updated_at integer NOT NULL)""")
        conn.execute("""INSERT INTO __new_menu_categories
            SELECT id,name,sort_order,i18n,created_at,updated_at FROM menu_categories""")
        conn.execute('DROP TABLE menu_categories')
        conn.execute('ALTER TABLE __new_menu_categories RENAME TO menu_categories')

    # Migration 0001: drop visibility from menu_entries
    if col_exists(conn, 'menu_entries', 'visibility'):
        print('    Dropping menu_entries.visibility...')
        try:
            conn.execute('ALTER TABLE menu_entries DROP COLUMN visibility')
        except Exception:
            conn.execute("""CREATE TABLE __me2 AS SELECT id,category_id,name,description,
                price,price_unit,image_url,out_of_stock,frozen,sort_order,hidden,
                allergens,i18n,metadata,created_at,updated_at FROM menu_entries""")
            conn.execute('DROP TABLE menu_entries')
            conn.execute('ALTER TABLE __me2 RENAME TO menu_entries')

    # Migration 0002+: add any still-missing columns
    for tbl, col, typedef in [
        ('menus', 'published', 'integer DEFAULT 1 NOT NULL'),
        ('menus', 'sort_order', 'integer DEFAULT 0 NOT NULL'),
        ('menus', 'icon', "text DEFAULT 'utensils' NOT NULL"),
        ('menu_entries', 'hidden', 'integer DEFAULT 0 NOT NULL'),
        ('settings', 'primary_locale', "text DEFAULT 'it' NOT NULL"),
        ('menus', 'available_from', 'text'),
        ('menus', 'available_to', 'text'),
    ]:
        if not col_exists(conn, tbl, col):
            conn.execute(f'ALTER TABLE {tbl} ADD COLUMN {col} {typedef}')

    if not table_exists(conn, 'menu_entry_memberships'):
        conn.execute("""CREATE TABLE menu_entry_memberships (
            menu_id text NOT NULL, entry_id text NOT NULL,
            PRIMARY KEY (menu_id, entry_id))""")

    if not table_exists(conn, 'labels'):
        conn.execute("""CREATE TABLE labels (
            id text PRIMARY KEY NOT NULL, name text NOT NULL,
            color text DEFAULT 'primary' NOT NULL, sort_order integer DEFAULT 0 NOT NULL,
            i18n text, created_at integer NOT NULL, updated_at integer NOT NULL)""")

    if not table_exists(conn, 'entry_labels'):
        conn.execute("""CREATE TABLE entry_labels (
            entry_id text NOT NULL, label_id text NOT NULL,
            PRIMARY KEY (entry_id, label_id))""")

    # settings
    features = restaurant['features']
    conn.execute("""UPDATE settings SET name=?,payoff=?,info=?,socials=?,opening_schedule=?,
        ai_chat_enabled=?,primary_locale=?,enabled_locales=?,disabled_locales=?,
        custom_locales=?,publication_state='published',updated_at=? WHERE id=1""", [
        restaurant['name'], restaurant.get('payoff'),
        json.dumps(restaurant.get('info')), json.dumps(restaurant.get('socials')),
        json.dumps(restaurant.get('openingSchedule')),
        1 if features['aiChat'] else 0, features['primaryLocale'],
        json.dumps(features['enabledLocales']),
        json.dumps(features.get('disabledLocales')),
        json.dumps(features.get('customLocales', [])), now,
    ])

    conn.execute('DELETE FROM menu_entry_memberships')
    conn.execute('DELETE FROM menu_entries')
    conn.execute('DELETE FROM menu_categories')
    conn.execute('DELETE FROM menus')

    for m in menus:
        conn.execute("""INSERT INTO menus (id,code,title,i18n,published,sort_order,icon,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)""", [
            m['id'],m['code'],m['title'],json.dumps(m.get('i18n')),
            1 if m['published'] else 0, m['sortOrder'], m.get('icon','utensils'), now, now])

    for cat in categories:
        conn.execute("""INSERT INTO menu_categories (id,name,sort_order,i18n,created_at,updated_at)
            VALUES (?,?,?,?,?,?)""", [cat['id'],cat['name'],cat['sortOrder'],json.dumps(cat.get('i18n')),now,now])
        for e in cat['entries']:
            allergens = e.get('allergens') or []
            conn.execute("""INSERT INTO menu_entries
                (id,category_id,name,description,price,price_unit,image_url,out_of_stock,frozen,
                 sort_order,hidden,allergens,i18n,metadata,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", [
                e['id'], cat['id'], e['name'], e.get('description'),
                round(e['price']*100), e.get('priceUnit'), e.get('imageUrl'),
                1 if e.get('outOfStock') else 0, 1 if e.get('frozen') else 0,
                e['sortOrder'], 1 if e.get('hidden') else 0,
                json.dumps(allergens) if allergens else None,
                json.dumps(e.get('i18n')), json.dumps(e.get('metadata')), now, now])
            for mid in (e.get('menuIds') or []):
                conn.execute('INSERT OR IGNORE INTO menu_entry_memberships VALUES (?,?)', [mid, e['id']])

    for v in variants:
        conn.execute("""INSERT OR REPLACE INTO menu_variants
            (id,name,description,sort_order,selections,i18n,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?)""", [
            v['id'],v['name'],v.get('description'),v['sortOrder'],
            json.dumps(v.get('selections')),json.dumps(v.get('i18n')),now,now])

    for x in extras:
        conn.execute("""INSERT OR REPLACE INTO menu_extras
            (id,name,type,max,options,i18n,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?)""", [
            x['id'],x['name'],x.get('type','zeroorone'),x.get('max',1),
            json.dumps(x.get('options')),json.dumps(x.get('i18n')),now,now])

    conn.execute('DELETE FROM entry_labels')
    conn.execute('DELETE FROM labels')
    for lbl in (CATALOG.get('labels') or []):
        conn.execute("""INSERT OR REPLACE INTO labels (id,name,color,sort_order,i18n,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?)""", [
            lbl['id'], lbl['name'], lbl.get('color','primary'), lbl.get('sortOrder',0),
            json.dumps(lbl.get('i18n')), now, now])
    for cat in categories:
        for e in cat['entries']:
            for lid in (e.get('labelIds') or []):
                conn.execute('INSERT OR IGNORE INTO entry_labels (entry_id,label_id) VALUES (?,?)', [e['id'], lid])

    conn.execute('PRAGMA foreign_keys=ON')
    conn.commit()
    conn.close()
    print(f'    Done.')
`;
}

main().catch((err) => {
  console.error('\n❌', err.message ?? err);
  process.exit(1);
});
