import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import type { Env } from '../types';

type D1Db = ReturnType<typeof drizzleD1>;

function withBatch(db: object): D1Db {
  if ('batch' in db) return db as D1Db;
  return Object.assign(db, {
    async batch(queries: unknown[]) {
      const results: unknown[] = [];
      for (const query of queries) results.push(await (query as { execute: () => Promise<unknown> }).execute());
      return results;
    },
  }) as D1Db;
}

export function createDb(env: Env): D1Db | null {
  if (env.SQLITE_DB) return withBatch(drizzleSqlite(env.SQLITE_DB));
  if (env.DB) return drizzleD1(env.DB);
  return null;
}

export type DbInstance = NonNullable<ReturnType<typeof createDb>>;
