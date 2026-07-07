import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from '../app';
import type { Env } from '../types';
import { createFsBucket } from './fs-bucket';
import { applyMigrations, createD1Compat, openSelfHostSqlite } from './sqlite';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const port = Number(process.env.PORT || 8787);
const dataDir = process.env.DATA_DIR || join(root, '.self-host');
const dbPath = process.env.SQLITE_PATH || join(dataDir, 'tony-menu.sqlite');
const bucketDir = process.env.BUCKET_DIR || join(dataDir, 'bucket');

const sqlite = openSelfHostSqlite(dbPath);
applyMigrations(sqlite, join(root, 'backend/drizzle'));

const env: Env = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'production',
  SERVICE_NAME: process.env.SERVICE_NAME || 'menu-backend-self-host',
  COMMIT_SHA: process.env.COMMIT_SHA || 'self-host',
  ORDER_TIME_ZONE: process.env.ORDER_TIME_ZONE || 'UTC',
  SELF_HOST_AUTH_HEADER: process.env.SELF_HOST_AUTH_HEADER || 'x-forwarded-email',
  SQLITE_DB: sqlite,
  DB: createD1Compat(sqlite),
  PUBLIC_MENU_BUCKET: createFsBucket(bucketDir),
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || (process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/assets` : ''),
};

const app = createApp();
const waitUntil = (promise: Promise<unknown>) => void promise.catch((error) => console.error('[waitUntil]', error));

async function serveAsset(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/assets/')) return null;
  const key = decodeURIComponent(url.pathname.slice('/assets/'.length));
  const object = await env.PUBLIC_MENU_BUCKET?.get(key);
  if (!object) return new Response('Not Found', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(await object.arrayBuffer(), { headers });
}

async function fetch(request: Request) {
  const asset = await serveAsset(request);
  if (asset) return asset;
  return app.fetch(request, env, { waitUntil, passThroughOnException() {}, props: {} });
}

serve({ port, fetch });
console.log(`TonyMenu backend self-host listening on :${port}`);
console.log(`SQLite: ${dbPath}`);
console.log(`Bucket: ${bucketDir}`);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
