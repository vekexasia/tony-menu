import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import type { Env } from '../types';

type D1Db = ReturnType<typeof drizzleD1>;

export function createDb(env: Env): D1Db | null {
  if (env.DB) return drizzleD1(env.DB);
  return null;
}

export type DbInstance = NonNullable<ReturnType<typeof createDb>>;
