import { bench, describe } from 'vitest';
import { CatalogResponseSchema } from '@menu/schemas';
import { createApp } from '../app';
import { createDb } from '../db';
import { buildCatalogFromDb } from '../routes/catalog';
import { benchEnv, seedBenchRestaurant, silenceRequestLogger } from './fixtures';

/**
 * `GET /catalog` is the endpoint every diner hits when scanning a QR code, and
 * the only one that touches every catalog table. The Cloudflare Cache API and
 * R2 bindings are absent here, so each request takes the cold "live DB" path —
 * exactly the work that has to stay fast when a menu is published.
 */

silenceRequestLogger();

const db = seedBenchRestaurant();
const env = benchEnv(db);
const app = createApp();
const drizzle = createDb(env)!;

const catalogRequest = () =>
  app.fetch(new Request('https://bench.local/catalog', { method: 'GET' }), env);

// Sanity check: fail loudly at load time rather than silently benchmarking a 404.
const probe = await catalogRequest();
if (probe.status !== 200) {
  throw new Error(`benchmark fixture is broken: GET /catalog returned ${probe.status}`);
}
const catalogJson = await probe.text();

describe('GET /catalog', () => {
  bench('full request - 300 entries, 12 categories, 3 menus', async () => {
    const res = await catalogRequest();
    await res.arrayBuffer();
  });
});

describe('buildCatalogFromDb', () => {
  bench('public catalog (published menus, hidden entries removed)', async () => {
    await buildCatalogFromDb(drizzle, { publicOnly: true, includeHidden: false });
  });

  bench('admin preview (all menus, hidden entries included)', async () => {
    await buildCatalogFromDb(drizzle, { publicOnly: false, includeHidden: true });
  });
});

describe('catalog serialization', () => {
  bench('JSON.stringify of the built catalog', async () => {
    const catalog = await buildCatalogFromDb(drizzle, { publicOnly: true, includeHidden: false });
    JSON.stringify(catalog);
  });

  bench('validate the served payload against CatalogResponseSchema', () => {
    CatalogResponseSchema.parse(JSON.parse(catalogJson));
  });
});
