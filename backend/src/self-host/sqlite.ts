import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

export function openSelfHostSqlite(path: string): SqliteDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function applyMigrations(db: SqliteDatabase, migrationsDir: string): void {
  db.exec('CREATE TABLE IF NOT EXISTS __tony_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(db.prepare('SELECT name FROM __tony_migrations').all().map((row) => (row as { name: string }).name));
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .join(';\n');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO __tony_migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    })();
  }
}

export function createD1Compat(db: SqliteDatabase): D1Database {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async first<T = unknown>(colName?: string) {
          const row = statement.get(...params) as T | undefined;
          if (colName && row && typeof row === 'object') return (row as Record<string, unknown>)[colName] as T;
          return row ?? null;
        },
        async all<T = unknown>() {
          const results = statement.all(...params) as T[];
          return { results, success: true, meta: {} };
        },
        async run() {
          const result = statement.run(...params);
          return { success: true, meta: { changes: result.changes, last_row_id: result.lastInsertRowid } };
        },
        async raw<T = unknown>() {
          return statement.raw().all(...params) as T[];
        },
      };
    },
    async batch(statements: D1PreparedStatement[]) {
      return db.transaction(() => statements.map((statement) => statement.run()))();
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;
}
