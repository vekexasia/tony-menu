import { Hono } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { requireDb } from '../middleware/db';
import { requireAuth } from '../middleware/auth';
import { attachDb, requireAdmin } from '../middleware/admin-guard';
import { RecordViewBodySchema } from '@menu/schemas';
import type { CatalogResponse } from '@menu/schemas';
import * as schema from '../db/schema';
import type { AppBindings, Env } from '../types';

export const catalogRoutes = new Hono<AppBindings>()
  /**
   * GET /catalog
   *
   * Public endpoint. Serves the full menu catalog for this single-tenant
   * deployment.
   * 1. Try Cloudflare Cache API (fastest hot path)
   * 2. Fall back to R2 snapshot (warm persistent artifact)
   * 3. Fall back to live DB query and warm both R2 + cache
   */
  .get('/', requireDb, async (c) => {
    const db = c.get('db');

    const isPublished = await isMenuPublished(db);
    if (!isPublished) {
      await deleteCatalogArtifacts(c.env, c.req.url);
      return c.json({ error: 'Menu not published' }, 404);
    }

    const cached = await readCatalogCache(c.req.url);
    if (cached) {
      return withCatalogSource(cached, 'cache-api');
    }

    const snapshot = await readCatalogSnapshot(c.env);
    if (snapshot) {
      await writeCatalogCache(c.req.url, snapshot.response.clone());
      return withCatalogSource(snapshot.response, 'r2-snapshot');
    }

    const warmed = await refreshCatalogArtifacts(c.env, c.req.url, db);
    if (!warmed) {
      return c.json({ error: 'Menu not published' }, 404);
    }

    return withCatalogSource(warmed.response, 'live-db');
  })

  /**
   * POST /catalog/view
   *
   * Public endpoint. Records a single anonymous menu item view.
   * Privacy-safe: session_hash = SHA-256(IP + YYYYMMDD) — no PII stored.
   * Deduplication: UNIQUE(entry_id, date_bucket, session_hash) with INSERT OR IGNORE.
   * Failures are silently dropped (best-effort analytics).
   * Rate limited at 60 req/min per IP in app.ts.
   */
  .post('/view', requireDb, async (c) => {
    const db = c.get('db');

    try {
      const result = RecordViewBodySchema.safeParse(await c.req.json());
      if (!result.success) {
        return c.json({ ok: false }, 400);
      }
      const body = result.data;

      const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
      const now = new Date();
      const dateBucket = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
      const hashInput = `${ip}:${dateBucket}`;
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
      const sessionHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const [entry] = await db
        .select({ id: schema.menuEntries.id })
        .from(schema.menuEntries)
        .where(eq(schema.menuEntries.id, body.entryId))
        .limit(1);
      if (!entry) return c.json({ ok: true });

      await db
        .insert(schema.catalogViews)
        .values({
          id: crypto.randomUUID(),
          entryId: body.entryId,
          dateBucket,
          sessionHash,
          viewedAt: Date.now(),
        })
        .onConflictDoNothing();
    } catch {
      // Silent drop — view tracking must never block or error to the user
    }

    return c.json({ ok: true });
  })

  /**
   * POST /catalog/publish
   *
   * Admin-only. Regenerates the R2 snapshot from the DB.
   */
  .post('/publish', requireAuth, attachDb, requireAdmin, async (c) => {
    const bucket = c.env.PUBLIC_MENU_BUCKET;
    const db = c.get('db');

    const warmed = await refreshCatalogArtifacts(c.env, c.req.url, db, c.get('user').uid);
    if (!warmed) {
      return c.json({ error: 'Menu not published' }, 404);
    }

    if (!bucket) {
      return c.json({
        ok: true,
        warning: 'R2 bucket not configured; catalog cached via Cache API only',
        cacheWarmed: warmed.cacheWarmed,
        generatedAt: warmed.generatedAt,
      });
    }

    return c.json({
      ok: true,
      key: getCatalogSnapshotKey(),
      size: warmed.body.length,
      cacheWarmed: warmed.cacheWarmed,
      publishedAt: warmed.generatedAt,
    });
  });

// ── Catalog builder ──────────────────────────────────────────────────

import type { DbInstance } from '../db';

const CATALOG_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const PUBLIC_CATALOG_VERSION = 'public-v3';

type BuildCatalogOptions = {
  /** Public responses must hide drafts/unpublished menus. */
  publicOnly?: boolean;
  /** Admin preview endpoints may include entries hidden from public customers. */
  includeHidden?: boolean;
};

function getCatalogSnapshotKey(): string {
  return `catalog/${PUBLIC_CATALOG_VERSION}/menu.json`;
}

function getCatalogCacheRequest(requestUrl: string): Request {
  const url = new URL(requestUrl);
  url.pathname = `/catalog`;
  url.search = `?v=${PUBLIC_CATALOG_VERSION}`;
  return new Request(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
}

function makeCatalogResponse(body: string, etag?: string): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': CATALOG_CACHE_CONTROL,
  });
  if (etag) headers.set('ETag', etag);
  return new Response(body, { status: 200, headers });
}

function withCatalogSource(response: Response, source: 'cache-api' | 'r2-snapshot' | 'live-db'): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Catalog-Source', source);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readCatalogCache(requestUrl: string): Promise<Response | null> {
  if (typeof caches === 'undefined' || !('default' in caches)) return null;
  return (await caches.default.match(getCatalogCacheRequest(requestUrl))) ?? null;
}

async function writeCatalogCache(requestUrl: string, response: Response): Promise<boolean> {
  if (typeof caches === 'undefined' || !('default' in caches)) return false;
  await caches.default.put(getCatalogCacheRequest(requestUrl), response);
  return true;
}

export async function invalidateCatalogCache(requestUrl: string): Promise<boolean> {
  if (typeof caches === 'undefined' || !('default' in caches)) return false;
  return caches.default.delete(getCatalogCacheRequest(requestUrl));
}

async function readCatalogSnapshot(env: Env): Promise<{ response: Response; body: string } | null> {
  const bucket = env.PUBLIC_MENU_BUCKET;
  if (!bucket) return null;

  const obj = await bucket.get(getCatalogSnapshotKey());
  if (!obj) return null;

  const body = await obj.text();
  return {
    body,
    response: makeCatalogResponse(body, obj.httpEtag),
  };
}

async function writeCatalogSnapshot(env: Env, body: string, publishedBy?: string): Promise<boolean> {
  const bucket = env.PUBLIC_MENU_BUCKET;
  if (!bucket) return false;

  await bucket.put(getCatalogSnapshotKey(), body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      publishedAt: new Date().toISOString(),
      ...(publishedBy ? { publishedBy } : {}),
    },
  });

  return true;
}

async function deleteCatalogSnapshot(env: Env): Promise<boolean> {
  const bucket = env.PUBLIC_MENU_BUCKET;
  if (!bucket) return false;
  await bucket.delete(getCatalogSnapshotKey());
  return true;
}

export async function deleteCatalogArtifacts(
  env: Env,
  requestUrl: string,
): Promise<{ cacheDeleted: boolean; snapshotDeleted: boolean }> {
  const [cacheDeleted, snapshotDeleted] = await Promise.all([
    invalidateCatalogCache(requestUrl),
    deleteCatalogSnapshot(env),
  ]);
  return { cacheDeleted, snapshotDeleted };
}

export async function refreshCatalogArtifacts(
  env: Env,
  requestUrl: string,
  db: DbInstance,
  publishedBy?: string,
): Promise<{ response: Response; body: string; generatedAt: string; cacheWarmed: boolean; snapshotWritten: boolean } | null> {
  await invalidateCatalogCache(requestUrl);

  const catalog = await buildCatalogFromDb(db, { publicOnly: true, includeHidden: false });
  if (!catalog) {
    await deleteCatalogSnapshot(env);
    return null;
  }

  const body = JSON.stringify(catalog);
  const response = makeCatalogResponse(body);
  const [cacheWarmed, snapshotWritten] = await Promise.all([
    writeCatalogCache(requestUrl, response.clone()),
    writeCatalogSnapshot(env, body, publishedBy),
  ]);

  return {
    response,
    body,
    generatedAt: catalog.generatedAt,
    cacheWarmed,
    snapshotWritten,
  };
}

export async function warmCatalogAfterMutation(
  env: Env,
  requestUrl: string,
  db: DbInstance,
  publishedBy?: string,
): Promise<void> {
  await refreshCatalogArtifacts(env, requestUrl, db, publishedBy);
}

async function isMenuPublished(db: DbInstance): Promise<boolean> {
  const [row] = await db
    .select({ publicationState: schema.settings.publicationState })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  return row?.publicationState === 'published';
}

export async function buildCatalogFromDb(
  db: DbInstance,
  options: BuildCatalogOptions = {},
): Promise<CatalogResponse | null> {
  const { publicOnly = false, includeHidden = true } = options;

  const [restaurant] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);

  if (!restaurant) return null;
  if (publicOnly && restaurant.publicationState !== 'published') return null;

  const menus = await db
    .select()
    .from(schema.menus)
    .orderBy(asc(schema.menus.sortOrder), asc(schema.menus.code));
  const visibleMenus = publicOnly ? menus.filter((m) => m.published) : menus;

  const categories = await db
    .select()
    .from(schema.menuCategories)
    .orderBy(asc(schema.menuCategories.sortOrder));

  const entries = await db
    .select()
    .from(schema.menuEntries)
    .orderBy(asc(schema.menuEntries.sortOrder));
  const visibleEntries = includeHidden ? entries : entries.filter((entry) => !entry.hidden);

  const memberships = await db
    .select()
    .from(schema.menuEntryMemberships);

  const labelsRows = await db
    .select()
    .from(schema.labels)
    .orderBy(asc(schema.labels.sortOrder));

  const entryLabelsRows = await db
    .select()
    .from(schema.entryLabels);

  const variants = await db
    .select()
    .from(schema.menuVariants)
    .orderBy(asc(schema.menuVariants.sortOrder));

  const extras = await db
    .select()
    .from(schema.menuExtras);

  const menuIdsByEntry = new Map<string, string[]>();
  for (const m of memberships) {
    const list = menuIdsByEntry.get(m.entryId) || [];
    list.push(m.menuId);
    menuIdsByEntry.set(m.entryId, list);
  }

  const labelIdsByEntry = new Map<string, string[]>();
  for (const el of entryLabelsRows) {
    const list = labelIdsByEntry.get(el.entryId) || [];
    list.push(el.labelId);
    labelIdsByEntry.set(el.entryId, list);
  }

  const entriesByCategory = new Map<string, typeof entries>();
  for (const entry of visibleEntries) {
    const list = entriesByCategory.get(entry.categoryId) || [];
    list.push(entry);
    entriesByCategory.set(entry.categoryId, list);
  }

  return {
    restaurant: {
      id: 'singleton',
      slug: 'singleton',
      name: restaurant.name,
      payoff: restaurant.payoff,
      theme: restaurant.theme,
      info: restaurant.info,
      socials: restaurant.socials,
      openingSchedule: restaurant.openingSchedule,
      features: {
        aiChat: restaurant.aiChatEnabled,
        aiVoice: restaurant.aiChatEnabled && restaurant.aiVoiceEnabled,
        selection: restaurant.selectionEnabled,
        primaryLocale: restaurant.primaryLocale,
        enabledLocales: restaurant.enabledLocales,
        disabledLocales: restaurant.disabledLocales,
        customLocales: restaurant.customLocales ?? [],
      },
    },
    menus: visibleMenus.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      i18n: m.i18n,
      published: m.published,
      sortOrder: m.sortOrder,
      icon: m.icon,
      availableFrom: m.availableFrom ?? null,
      availableTo: m.availableTo ?? null,
      availableDays: m.availableDays ?? null,
    })),
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sortOrder,
      i18n: cat.i18n,
      entries: (entriesByCategory.get(cat.id) || []).map((e) => ({
        id: e.id,
        name: e.name,
        description: e.description,
        price: e.price / 100,
        priceUnit: e.priceUnit,
        imageUrl: e.imageUrl,
        outOfStock: e.outOfStock,
        frozen: e.frozen,
        sortOrder: e.sortOrder,
        hidden: e.hidden,
        menuIds: menuIdsByEntry.get(e.id) ?? [],
        labelIds: labelIdsByEntry.get(e.id) ?? [],
        allergens: e.allergens,
        i18n: e.i18n,
        metadata: e.metadata,
      })),
    })),
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      sortOrder: v.sortOrder,
      selections: v.selections,
      i18n: v.i18n,
    })),
    extras: extras.map((ex) => ({
      id: ex.id,
      name: ex.name,
      type: ex.type,
      max: ex.max,
      options: ex.options,
      i18n: ex.i18n,
    })),
    labels: labelsRows.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color as import('@menu/schemas').LabelColor,
      sortOrder: l.sortOrder,
      i18n: l.i18n,
    })),
    generatedAt: new Date().toISOString(),
  } as CatalogResponse;
}
