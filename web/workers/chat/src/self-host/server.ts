import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import worker from '../index';
import type { Env, WaitUntilContext } from '../types';
import { applyMigrations, createD1Compat, createMemoryKv, openSelfHostSqlite } from './sqlite';

const root = fileURLToPath(new URL('../../../../..', import.meta.url).href);
const port = Number(process.env.CHAT_PORT || process.env.PORT || 8788);
const dataDir = process.env.DATA_DIR || join(root, '.self-host');
const dbPath = process.env.SQLITE_PATH || join(dataDir, 'tony-menu.sqlite');

const sqlite = openSelfHostSqlite(dbPath);
applyMigrations(sqlite, join(root, 'backend/drizzle'));

const env: Env = {
  ...process.env,
  DB: createD1Compat(sqlite),
  MENU_CACHE: createMemoryKv(),
  CHAT_SESSION_SECRET: process.env.CHAT_SESSION_SECRET || 'dev-change-me',
  REFRESH_SECRET: process.env.REFRESH_SECRET || 'dev-refresh-secret',
  LLM_PROVIDER: process.env.LLM_PROVIDER || 'anthropic',
  LLM_MODEL: process.env.LLM_MODEL || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
};

const ctx: WaitUntilContext = {
  waitUntil(promise) {
    void promise.catch((error) => console.error('[waitUntil]', error));
  },
};

serve({ port, fetch: (request) => worker.fetch(request, env, ctx) });
console.log(`TonyMenu chat self-host listening on :${port}`);
console.log(`SQLite: ${dbPath}`);
