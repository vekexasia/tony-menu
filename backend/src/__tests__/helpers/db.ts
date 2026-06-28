/**
 * D1 integration test helpers (single-tenant)
 *
 * Provides:
 *  - createTestDb()       in-memory SQLite with all migrations applied
 *  - makeDbEnv(db)        extends makeEnv() with the D1 shim + signed JWT support
 *  - signTestJwt(uid)     produces a valid RS256 Bearer token accepted by requireAuth
 *  - seed helpers         seedSettings, seedMenu, seedCategory, seedEntry
 *
 * Design:
 *  - better-sqlite3 is synchronous; the D1 shim wraps every call in Promise.resolve()
 *  - A single RS256 key pair is generated once per module (not per test) and cached
 *  - The JWKS fetch is intercepted globally via vi.stubGlobal so the real verifyJwt
 *    code path runs — no mocking of the middleware itself
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { vi } from 'vitest';
import { makeEnv } from '../helpers';
import type { Env } from '../../types';

// ── Migration loading ─────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../drizzle');

function loadMigrations(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const statements: string[] = [];
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
    // Drizzle uses '--> statement-breakpoint' as a separator
    const parts = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean);
    statements.push(...parts);
  }
  return statements;
}

// ── D1 shim ───────────────────────────────────────────────────────────

const SQL_KEY = Symbol('sql');
const PARAMS_KEY = Symbol('params');

interface InternalStatement {
  [SQL_KEY]: string;
  [PARAMS_KEY]: unknown[];
}

function makePreparedStatement(bsdb: Database.Database, sql: string): D1PreparedStatement & InternalStatement {
  let params: unknown[] = [];

  const self = {
    [SQL_KEY]: sql,
    get [PARAMS_KEY]() { return params; },

    bind(...args: unknown[]) {
      params = args;
      return self as unknown as D1PreparedStatement;
    },

    async run(): Promise<D1Result> {
      const result = bsdb.prepare(sql).run(...params);
      return {
        success: true,
        results: [],
        meta: {
          served_by: 'test',
          duration: 0,
          changes: result.changes,
          last_row_id: Number(result.lastInsertRowid),
          changed_db: result.changes > 0,
          size_after: 0,
          rows_read: 0,
          rows_written: result.changes,
        },
      };
    },

    async first<T>(column?: string): Promise<T | null> {
      const row = bsdb.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      if (column !== undefined) return (row[column] as T) ?? null;
      return row as T;
    },

    async all<T>(): Promise<D1Result<T>> {
      const rows = bsdb.prepare(sql).all(...params) as T[];
      return {
        success: true,
        results: rows,
        meta: {
          served_by: 'test',
          duration: 0,
          changes: 0,
          last_row_id: 0,
          changed_db: false,
          size_after: 0,
          rows_read: rows.length,
          rows_written: 0,
        },
      };
    },

    async raw<T extends unknown[]>(): Promise<T[]> {
      return bsdb.prepare(sql).raw(true).all(...params) as T[];
    },
  };

  return self as unknown as D1PreparedStatement & InternalStatement;
}

function createD1Shim(bsdb: Database.Database): D1Database {
  return {
    prepare(sql: string) {
      return makePreparedStatement(bsdb, sql);
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      const run = bsdb.transaction(() => {
        for (const stmt of statements) {
          const s = stmt as unknown as InternalStatement;
          const sql = s[SQL_KEY];
          const params = s[PARAMS_KEY];
          const result = bsdb.prepare(sql).run(...params);
          results.push({
            success: true,
            results: [] as T[],
            meta: {
              served_by: 'test',
              duration: 0,
              changes: result.changes,
              last_row_id: Number(result.lastInsertRowid),
              changed_db: result.changes > 0,
              size_after: 0,
              rows_read: 0,
              rows_written: result.changes,
            },
          });
        }
      });
      run();
      return results;
    },

    async exec(query: string): Promise<D1ExecResult> {
      bsdb.exec(query);
      return { count: 0, duration: 0 };
    },

    async dump(): Promise<ArrayBuffer> {
      return new ArrayBuffer(0);
    },

    withSession(_token?: string): D1DatabaseSession {
      const shim = this;
      return {
        ...shim,
        getBookmark() { return null; },
      } as unknown as D1DatabaseSession;
    },
  };
}

// ── createTestDb ──────────────────────────────────────────────────────

export interface TestDb {
  /** The D1-compatible shim — pass as env.DB */
  d1: D1Database;
  /** Raw better-sqlite3 handle for direct assertions */
  raw: Database.Database;
}

let _migrations: string[] | null = null;

export function createTestDb(): TestDb {
  const bsdb = new Database(':memory:');
  bsdb.pragma('foreign_keys = ON');

  if (!_migrations) _migrations = loadMigrations();
  for (const stmt of _migrations) {
    bsdb.exec(stmt);
  }

  return { d1: createD1Shim(bsdb), raw: bsdb };
}

// ── JWT / JWKS ────────────────────────────────────────────────────────

const TEST_ISSUER = 'https://test-issuer.example.com';
const TEST_AUDIENCE = 'menu-backend-test';
const TEST_KID = 'test-key-1';

let _keyPair: CryptoKeyPair | null = null;
let _publicJwk: JsonWebKey | null = null;
let _fetchMockInstalled = false;

async function ensureKeyPair(): Promise<void> {
  if (_keyPair) return;
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  _keyPair = kp;
  _publicJwk = await crypto.subtle.exportKey('jwk', kp.publicKey) as JsonWebKey;
}

/**
 * Install a global fetch mock that returns the test JWKS for the test issuer
 * and falls through to real fetch for everything else.
 *
 * Safe to call multiple times — installs only once per test run.
 */
export async function installJwksMock(): Promise<void> {
  await ensureKeyPair();
  if (_fetchMockInstalled) return;

  // Cloudflare Access publishes its JWKS at /cdn-cgi/access/certs
  const certsUrl = `${TEST_ISSUER}/cdn-cgi/access/certs`;

  const jwksBody = JSON.stringify({
    keys: [{ ..._publicJwk!, kid: TEST_KID, use: 'sig', alg: 'RS256' }],
  });

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === certsUrl) {
      return new Response(jwksBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return fetch(input, init);
  });

  _fetchMockInstalled = true;
}

function base64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer
    ? Buffer.from(new Uint8Array(data))
    : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return bytes.toString('base64url');
}

function strToB64url(s: string): string {
  return base64url(new TextEncoder().encode(s));
}

/**
 * Sign and return a valid RS256 token accepted by requireAuth.
 *
 * The first argument is treated as the user's email (the stable identifier
 * Cloudflare Access provides). It's set as both `email` and `sub` claims so
 * the JWT looks like what CF Access actually issues.
 */
export async function signTestJwt(email: string, extra: Record<string, unknown> = {}): Promise<string> {
  await ensureKeyPair();
  const header = { alg: 'RS256', kid: TEST_KID, typ: 'JWT' };
  const payload = {
    sub: email,
    email,
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };

  const headerB64 = strToB64url(JSON.stringify(header));
  const payloadB64 = strToB64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    _keyPair!.privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Sign an arbitrary header + payload with the test RSA key. Used to exercise
 * the verifyJwt failure paths (wrong alg, missing kid, etc.) that signTestJwt
 * cannot produce because it always emits a well-formed RS256 header.
 */
export async function signTestJwtRaw(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  await ensureKeyPair();
  const headerB64 = strToB64url(JSON.stringify(header));
  const payloadB64 = strToB64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    _keyPair!.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
}

export const TEST_JWT_ISSUER = TEST_ISSUER;
export const TEST_JWT_AUDIENCE = TEST_AUDIENCE;
export const TEST_JWT_KID = TEST_KID;

// ── Env factory ───────────────────────────────────────────────────────

/**
 * Returns a full Env with the in-memory D1 shim wired in and auth configured
 * for the test issuer/audience. Pass to testRequest as env override.
 */
export function makeDbEnv(db: TestDb, overrides: Partial<Env> = {}): Env {
  return makeEnv({
    DB: db.d1,
    ACCESS_TEAM_DOMAIN: TEST_ISSUER,
    ACCESS_AUD: TEST_AUDIENCE,
    ...overrides,
  });
}

// ── Seed helpers ──────────────────────────────────────────────────────

/**
 * The migration already inserts a default settings row (id = 1, name = "My Restaurant",
 * publication_state = "draft"). seedSettings updates that row with test fixtures.
 */
export function seedSettings(db: TestDb, fields: Record<string, unknown> = {}): void {
  const defaults: Record<string, unknown> = {
    name: 'Test Restaurant',
    publication_state: 'published',
    ai_chat_enabled: 0,
    ...fields,
  };
  const cols = Object.keys(defaults);
  const setClause = cols.map((c) => `${c} = ?`).join(', ');
  db.raw.prepare(`UPDATE settings SET ${setClause}, updated_at = ? WHERE id = 1`)
    .run(...cols.map((c) => defaults[c]), Date.now());
}

export function seedMenu(
  db: TestDb,
  menuId: string,
  code = 'food',
  title?: string,
  options: { published?: boolean; sortOrder?: number } = {},
): void {
  const now = Date.now();
  db.raw.prepare(
    `INSERT OR IGNORE INTO menus (id, code, title, published, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    menuId,
    code,
    title ?? code,
    options.published === false ? 0 : 1,
    options.sortOrder ?? 0,
    now,
    now,
  );
}

/**
 * Seed a category. Categories are restaurant-wide — `menuId` is no longer part of the schema.
 * Pass entries to specific menus via seedMembership() after creating the entry.
 */
export function seedCategory(
  db: TestDb,
  categoryId: string,
  name = 'Test Category',
  sortOrder = 0,
): void {
  const now = Date.now();
  db.raw.prepare(
    `INSERT OR IGNORE INTO menu_categories
       (id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(categoryId, name, sortOrder, now, now);
}

export function seedEntry(
  db: TestDb,
  entryId: string,
  categoryId: string,
  extra: Record<string, unknown> = {},
): void {
  const now = Date.now();
  db.raw.prepare(
    `INSERT OR IGNORE INTO menu_entries
       (id, category_id, name, price, sort_order, hidden, out_of_stock, frozen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
  ).run(
    entryId,
    categoryId,
    (extra.name as string | undefined) ?? 'Test Entry',
    (extra.price as number | undefined) ?? 1000,
    (extra.sortOrder as number | undefined) ?? 0,
    (extra.hidden as boolean | undefined) ? 1 : 0,
    now,
    now,
  );
}

export function seedMembership(db: TestDb, menuId: string, entryId: string): void {
  db.raw.prepare(
    `INSERT OR IGNORE INTO menu_entry_memberships (menu_id, entry_id) VALUES (?, ?)`,
  ).run(menuId, entryId);
}
