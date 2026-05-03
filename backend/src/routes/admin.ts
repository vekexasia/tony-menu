import { Hono, type Context } from 'hono';
import { eq, and, gte, lt, asc, desc, count, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { attachDb, requireAdmin } from '../middleware/admin-guard';
import * as schema from '../db/schema';
import { computeLeaderboardMovement, VALID_PERIODS, periodToMs, computeWindows } from '../lib/analytics';
import { buildCatalogFromDb, warmCatalogAfterMutation } from './catalog';
import { parseBody } from '../lib/validate';
import { validateImage } from '../lib/image';
import { checkRateLimit } from '../lib/rate-limit';
import { isDemoMode } from '../lib/demo';
import { resetDemoData } from '../lib/demo-reset';
import {
  UpdateSettingsBodySchema,
  UpdateHoursBodySchema,
  UpdateCategoryBodySchema,
  ReorderItemsBodySchema,
  CreateEntryBodySchema,
  UpdateEntryBodySchema,
  MoveEntryBodySchema,
  TranslateRequestBodySchema,
  CreateMenuBodySchema,
  UpdateMenuBodySchema,
  CreateLabelBodySchema,
  UpdateLabelBodySchema,
} from '@menu/schemas';
import type { AppBindings } from '../types';
import type { DbInstance } from '../db';

// All admin routes require auth + db + admin gate.
const admin = new Hono<AppBindings>();

const base = [requireAuth, attachDb, requireAdmin] as const;


admin.post('/demo/reset', ...base, async (c) => {
  if (!isDemoMode(c.env)) return c.json({ error: 'Not Found' }, 404);

  await resetDemoData(c.env);
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});
// ── Catalog Preview (admin) ──────────────────────────────────────────

admin.get('/catalog', ...base, async (c) => {
  const catalog = await buildCatalogFromDb(c.get('db'), {
    publicOnly: false,
    includeHidden: true,
  });
  if (!catalog) return c.json({ error: 'Not found' }, 404);
  return c.json(catalog);
});

// ── Settings ─────────────────────────────────────────────────────────

admin.get('/settings', ...base, async (c) => {
  const [row] = await c.get('db')
    .select({
      chatAgentPrompt: schema.settings.chatAgentPrompt,
      aiChatEnabled: schema.settings.aiChatEnabled,
      promotionAlert: schema.settings.promotionAlert,
      publicationState: schema.settings.publicationState,
      primaryLocale: schema.settings.primaryLocale,
      enabledLocales: schema.settings.enabledLocales,
      disabledLocales: schema.settings.disabledLocales,
      customLocales: schema.settings.customLocales,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1));

  if (!row) return c.json({ error: 'Not found' }, 404);

  return c.json({
    chatAgentPrompt: row.chatAgentPrompt ?? '',
    aiChatEnabled: row.aiChatEnabled,
    promotionAlert: row.promotionAlert ?? null,
    publicationState: row.publicationState,
    primaryLocale: row.primaryLocale,
    enabledLocales: row.enabledLocales ?? null,
    disabledLocales: row.disabledLocales ?? [],
    customLocales: row.customLocales ?? [],
  });
});

admin.put('/settings', ...base, async (c) => {
  const body = await parseBody(c, UpdateSettingsBodySchema);
  if (body instanceof Response) return body;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.payoff !== undefined) updates.payoff = body.payoff;
  if (body.theme !== undefined) updates.theme = body.theme;
  if (body.info !== undefined) updates.info = body.info;
  if (body.socials !== undefined) updates.socials = body.socials;
  if (body.promotionAlert !== undefined) updates.promotionAlert = body.promotionAlert;
  if (body.chatAgentPrompt !== undefined) updates.chatAgentPrompt = body.chatAgentPrompt;
  if (body.aiChatEnabled !== undefined) updates.aiChatEnabled = body.aiChatEnabled;
  if (body.primaryLocale !== undefined) updates.primaryLocale = body.primaryLocale;
  if (body.enabledLocales !== undefined) updates.enabledLocales = body.enabledLocales;
  if (body.disabledLocales !== undefined) updates.disabledLocales = body.disabledLocales;
  if (body.customLocales !== undefined) updates.customLocales = body.customLocales;

  await c.get('db')
    .update(schema.settings)
    .set(updates)
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Publish toggle ───────────────────────────────────────────────────

admin.put('/publication', ...base, async (c) => {
  const body = await c.req.json<{ published: boolean }>();
  await c.get('db')
    .update(schema.settings)
    .set({
      publicationState: body.published ? 'published' : 'draft',
      updatedAt: Date.now(),
    })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Opening Hours ────────────────────────────────────────────────────

admin.put('/hours', ...base, async (c) => {
  const body = await parseBody(c, UpdateHoursBodySchema);
  if (body instanceof Response) return body;

  await c.get('db')
    .update(schema.settings)
    .set({
      openingSchedule: body.openingSchedule,
      updatedAt: Date.now(),
    })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Menus ────────────────────────────────────────────────────────────

admin.get('/menus', ...base, async (c) => {
  const rows = await c.get('db')
    .select()
    .from(schema.menus)
    .orderBy(asc(schema.menus.sortOrder), asc(schema.menus.code));
  return c.json({
    menus: rows.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      i18n: m.i18n,
      published: m.published,
      sortOrder: m.sortOrder,
      icon: m.icon,
      availableFrom: m.availableFrom ?? null,
      availableTo: m.availableTo ?? null,
    })),
  });
});

admin.post('/menus', ...base, async (c) => {
  const body = await parseBody(c, CreateMenuBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');

  const [existing] = await db
    .select({ id: schema.menus.id })
    .from(schema.menus)
    .where(eq(schema.menus.code, body.code))
    .limit(1);
  if (existing) return c.json({ error: 'A menu with that code already exists' }, 409);

  const [{ maxOrder } = { maxOrder: -1 }] = await db
    .select({ maxOrder: schema.menus.sortOrder })
    .from(schema.menus)
    .orderBy(desc(schema.menus.sortOrder))
    .limit(1) as Array<{ maxOrder: number | null }>;

  const id = crypto.randomUUID();
  await db.insert(schema.menus).values({
    id,
    code: body.code,
    title: body.title,
    i18n: body.i18n ?? null,
    published: true,
    sortOrder: (maxOrder ?? -1) + 1,
    ...(body.icon ? { icon: body.icon } : {}),
  });

  await refreshPublicCatalog(c);
  return c.json({ ok: true, id }, 201);
});

// /menus/reorder must be registered BEFORE /menus/:menuId to avoid the param matching "reorder".
admin.patch('/menus/reorder', ...base, async (c) => {
  const body = await parseBody(c, ReorderItemsBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');

  for (const item of body.items) {
    await db
      .update(schema.menus)
      .set({ sortOrder: item.order, updatedAt: Date.now() })
      .where(eq(schema.menus.id, item.id));
  }

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.patch('/menus/:menuId', ...base, async (c) => {
  const menuId = c.req.param('menuId');
  const body = await parseBody(c, UpdateMenuBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');

  if (body.code !== undefined) {
    const [existing] = await db
      .select({ id: schema.menus.id })
      .from(schema.menus)
      .where(eq(schema.menus.code, body.code))
      .limit(1);
    if (existing && existing.id !== menuId) {
      return c.json({ error: 'A menu with that code already exists' }, 409);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.code !== undefined) updates.code = body.code;
  if (body.title !== undefined) updates.title = body.title;
  if (body.i18n !== undefined) updates.i18n = body.i18n;
  if (body.published !== undefined) updates.published = body.published;
  if (body.icon !== undefined) updates.icon = body.icon;
  if ('availableFrom' in body) updates.availableFrom = body.availableFrom ?? null;
  if ('availableTo' in body) updates.availableTo = body.availableTo ?? null;

  await db
    .update(schema.menus)
    .set(updates)
    .where(eq(schema.menus.id, menuId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.delete('/menus/:menuId', ...base, async (c) => {
  const menuId = c.req.param('menuId');
  // FK cascade on menu_entry_memberships removes membership rows automatically.
  await c.get('db')
    .delete(schema.menus)
    .where(eq(schema.menus.id, menuId));
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Labels ────────────────────────────────────────────────────────────

admin.get('/labels', ...base, async (c) => {
  const rows = await c.get('db')
    .select()
    .from(schema.labels)
    .orderBy(asc(schema.labels.sortOrder), asc(schema.labels.createdAt));
  return c.json({ labels: rows.map((r) => ({ id: r.id, name: r.name, color: r.color, sortOrder: r.sortOrder, i18n: r.i18n })) });
});

admin.post('/labels', ...base, async (c) => {
  const body = await parseBody(c, CreateLabelBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');
  const [last] = await db
    .select({ maxOrder: schema.labels.sortOrder })
    .from(schema.labels)
    .orderBy(desc(schema.labels.sortOrder))
    .limit(1) as Array<{ maxOrder: number | null }>;
  const id = crypto.randomUUID();
  await db.insert(schema.labels).values({
    id,
    name: body.name,
    color: body.color ?? 'primary',
    sortOrder: (last?.maxOrder ?? -1) + 1,
    i18n: body.i18n ?? null,
  });
  await refreshPublicCatalog(c);
  return c.json({ ok: true, id }, 201);
});

// /labels/reorder must be before /labels/:labelId
admin.patch('/labels/reorder', ...base, async (c) => {
  const body = await parseBody(c, ReorderItemsBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');
  for (const item of body.items) {
    await db.update(schema.labels).set({ sortOrder: item.order, updatedAt: Date.now() })
      .where(eq(schema.labels.id, item.id));
  }
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.patch('/labels/:labelId', ...base, async (c) => {
  const labelId = c.req.param('labelId');
  const body = await parseBody(c, UpdateLabelBodySchema);
  if (body instanceof Response) return body;
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.i18n !== undefined) updates.i18n = body.i18n;
  await c.get('db').update(schema.labels).set(updates).where(eq(schema.labels.id, labelId));
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.delete('/labels/:labelId', ...base, async (c) => {
  const labelId = c.req.param('labelId');
  // FK cascade on entry_labels removes assignments automatically.
  await c.get('db').delete(schema.labels).where(eq(schema.labels.id, labelId));
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Categories ───────────────────────────────────────────────────────

admin.post('/categories', ...base, async (c) => {
  const body = await parseBody(c, UpdateCategoryBodySchema);
  if (body instanceof Response) return body;
  if (!body.name || !body.name.trim()) return c.json({ error: 'Name required' }, 400);
  const db = c.get('db');

  const [{ maxOrder } = { maxOrder: -1 }] = await db
    .select({ maxOrder: schema.menuCategories.sortOrder })
    .from(schema.menuCategories)
    .orderBy(desc(schema.menuCategories.sortOrder))
    .limit(1) as Array<{ maxOrder: number | null }>;

  const id = crypto.randomUUID();
  await db.insert(schema.menuCategories).values({
    id,
    name: body.name.trim(),
    sortOrder: (maxOrder ?? -1) + 1,
    i18n: body.i18n ?? null,
  });

  await refreshPublicCatalog(c);
  return c.json({ ok: true, id }, 201);
});

admin.put('/categories/:categoryId', ...base, async (c) => {
  const categoryId = c.req.param('categoryId');
  const body = await parseBody(c, UpdateCategoryBodySchema);
  if (body instanceof Response) return body;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.i18n !== undefined) updates.i18n = body.i18n;

  await c.get('db')
    .update(schema.menuCategories)
    .set(updates)
    .where(eq(schema.menuCategories.id, categoryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.delete('/categories/:categoryId', ...base, async (c) => {
  const categoryId = c.req.param('categoryId');
  const db = c.get('db');

  const entryRows = await db
    .select({ id: schema.menuEntries.id })
    .from(schema.menuEntries)
    .where(eq(schema.menuEntries.categoryId, categoryId));
  const entryIds = entryRows.map((entry) => entry.id);

  if (entryIds.length > 0) {
    await db
      .delete(schema.catalogViews)
      .where(inArray(schema.catalogViews.entryId, entryIds));
  }

  await db
    .delete(schema.menuEntries)
    .where(eq(schema.menuEntries.categoryId, categoryId));

  await db
    .delete(schema.menuCategories)
    .where(eq(schema.menuCategories.id, categoryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.patch('/categories/reorder', ...base, async (c) => {
  const body = await parseBody(c, ReorderItemsBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');

  for (const item of body.items) {
    await db
      .update(schema.menuCategories)
      .set({ sortOrder: item.order, updatedAt: Date.now() })
      .where(eq(schema.menuCategories.id, item.id));
  }

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Menu Entries ─────────────────────────────────────────────────────

admin.post('/categories/:categoryId/entries', ...base, async (c) => {
  const categoryId = c.req.param('categoryId');

  const [cat] = await c.get('db')
    .select({ id: schema.menuCategories.id })
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.id, categoryId))
    .limit(1);
  if (!cat) return c.json({ error: 'Category not found' }, 404);

  const body = await parseBody(c, CreateEntryBodySchema);
  if (body instanceof Response) return body;

  const id = crypto.randomUUID();
  const db = c.get('db');

  await db
    .insert(schema.menuEntries)
    .values({
      id,
      categoryId,
      name: body.name,
      description: body.description || null,
      // Convert euros to integer cents: €12.50 → 1250
      price: Math.round(body.price * 100),
      priceUnit: body.priceUnit || null,
      outOfStock: body.outOfStock ?? false,
      frozen: body.frozen ?? false,
      sortOrder: body.order ?? 0,
      hidden: body.hidden ?? false,
      allergens: body.allergens || null,
      i18n: body.i18n || null,
    });

  if (body.menuIds && body.menuIds.length > 0) {
    await setEntryMemberships(db, id, body.menuIds);
  }

  if (body.labelIds && body.labelIds.length > 0) {
    await setEntryLabelAssignments(db, id, body.labelIds);
  }

  await refreshPublicCatalog(c);
  return c.json({ ok: true, id }, 201);
});

admin.put('/entries/:entryId', ...base, async (c) => {
  const entryId = c.req.param('entryId');
  const body = await parseBody(c, UpdateEntryBodySchema);
  if (body instanceof Response) return body;

  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.price !== undefined) updates.price = Math.round(body.price * 100);
  if (body.outOfStock !== undefined) updates.outOfStock = body.outOfStock;
  if (body.frozen !== undefined) updates.frozen = body.frozen;
  if (body.allergens !== undefined) updates.allergens = body.allergens;
  if (body.priceUnit !== undefined) updates.priceUnit = body.priceUnit;
  if (body.i18n !== undefined) updates.i18n = body.i18n;
  if (body.hidden !== undefined) updates.hidden = body.hidden;

  const db = c.get('db');
  await db
    .update(schema.menuEntries)
    .set(updates)
    .where(eq(schema.menuEntries.id, entryId));

  if (body.menuIds !== undefined) {
    await setEntryMemberships(db, entryId, body.menuIds);
  }
  if (body.labelIds !== undefined) {
    await setEntryLabelAssignments(db, entryId, body.labelIds);
  }

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.patch('/entries/reorder', ...base, async (c) => {
  const body = await parseBody(c, ReorderItemsBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');

  for (const item of body.items) {
    await db
      .update(schema.menuEntries)
      .set({ sortOrder: item.order, updatedAt: Date.now() })
      .where(eq(schema.menuEntries.id, item.id));
  }

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.delete('/entries/:entryId', ...base, async (c) => {
  const entryId = c.req.param('entryId');
  const db = c.get('db');

  const [entry] = await db
    .select({ imageUrl: schema.menuEntries.imageUrl })
    .from(schema.menuEntries)
    .where(eq(schema.menuEntries.id, entryId))
    .limit(1);

  if (entry?.imageUrl) {
    const bucket = c.env.PUBLIC_MENU_BUCKET;
    if (bucket) {
      const key = r2KeyFromUrl(entry.imageUrl);
      if (key) await bucket.delete(key);
    }
  }

  await db.delete(schema.menuEntries).where(eq(schema.menuEntries.id, entryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.post('/entries/:entryId/move', ...base, async (c) => {
  const entryId = c.req.param('entryId');
  const body = await parseBody(c, MoveEntryBodySchema);
  if (body instanceof Response) return body;

  const [targetCat] = await c.get('db')
    .select({ id: schema.menuCategories.id })
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.id, body.targetCategoryId))
    .limit(1);
  if (!targetCat) return c.json({ error: 'Target category not found' }, 404);

  await c.get('db')
    .update(schema.menuEntries)
    .set({
      categoryId: body.targetCategoryId,
      updatedAt: Date.now(),
    })
    .where(eq(schema.menuEntries.id, entryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Image Upload / Delete ────────────────────────────────────────────

admin.post('/entries/:entryId/image', ...base, async (c) => {
  const entryId = c.req.param('entryId');
  const bucket = c.env.PUBLIC_MENU_BUCKET;

  if (!bucket) return c.json({ error: 'R2 bucket not configured' }, 503);

  const [entry] = await c.get('db')
    .select({ id: schema.menuEntries.id })
    .from(schema.menuEntries)
    .where(eq(schema.menuEntries.id, entryId))
    .limit(1);
  if (!entry) return c.json({ error: 'Entry not found' }, 404);

  const body = await c.req.arrayBuffer();
  const validation = validateImage(body);
  if ('error' in validation) return c.json({ error: validation.error }, validation.status);

  const key = `images/entries/${entryId}-${Date.now()}${validation.ext}`;
  await bucket.put(key, body, { httpMetadata: { contentType: validation.type } });

  const r2Base = (c.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!r2Base) return c.json({ error: 'R2_PUBLIC_URL not configured' }, 503);
  const imageUrl = `${r2Base}/${key}`;

  await c.get('db')
    .update(schema.menuEntries)
    .set({ imageUrl, updatedAt: Date.now() })
    .where(eq(schema.menuEntries.id, entryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true, imageUrl });
});

admin.delete('/entries/:entryId/image', ...base, async (c) => {
  const entryId = c.req.param('entryId');
  const bucket = c.env.PUBLIC_MENU_BUCKET;
  const db = c.get('db');

  const [entry] = await db
    .select({ imageUrl: schema.menuEntries.imageUrl })
    .from(schema.menuEntries)
    .where(eq(schema.menuEntries.id, entryId))
    .limit(1);

  if (entry?.imageUrl && bucket) {
    const key = r2KeyFromUrl(entry.imageUrl);
    if (key) await bucket.delete(key);
  }

  await db
    .update(schema.menuEntries)
    .set({ imageUrl: null, updatedAt: Date.now() })
    .where(eq(schema.menuEntries.id, entryId));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

admin.post('/header-image', ...base, async (c) => {
  const upload = await uploadSettingsImage(c, 'header');
  if ('response' in upload) return upload.response;

  const db = c.get('db');
  const [row] = await db
    .select({ info: schema.settings.info })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);

  const updatedInfo = {
    ...(row?.info || {}),
    headerImage: upload.imageUrl,
  };

  await db
    .update(schema.settings)
    .set({ info: updatedInfo, updatedAt: Date.now() })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true, imageUrl: upload.imageUrl });
});

admin.post('/promotion-image', ...base, async (c) => {
  const upload = await uploadSettingsImage(c, 'promotion');
  if ('response' in upload) return upload.response;

  const db = c.get('db');
  const [row] = await db
    .select({ promotionAlert: schema.settings.promotionAlert })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);

  const updatedPromotionAlert = {
    ...((row?.promotionAlert as Record<string, unknown> | null) || {}),
    url: upload.imageUrl,
  };

  await db
    .update(schema.settings)
    .set({ promotionAlert: updatedPromotionAlert, updatedAt: Date.now() })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true, imageUrl: upload.imageUrl });
});

admin.post('/locale-flag/:code', ...base, async (c) => {
  const code = c.req.param('code');
  if (!/^[a-z0-9-]{2,10}$/.test(code)) {
    return c.json({ error: 'Invalid locale code' }, 400);
  }

  const db = c.get('db');
  const [row] = await db
    .select({ customLocales: schema.settings.customLocales })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  const list = row?.customLocales ?? [];
  const target = list.find((l) => l.code === code);
  if (!target) return c.json({ error: 'Custom locale not found' }, 404);

  const upload = await uploadSettingsImage(c, `flag-${code}`);
  if ('response' in upload) return upload.response;

  const bucket = c.env.PUBLIC_MENU_BUCKET;
  if (target.flagUrl && bucket) {
    const oldKey = r2KeyFromUrl(target.flagUrl);
    if (oldKey) await bucket.delete(oldKey);
  }

  const updated = list.map((l) => l.code === code ? { ...l, flagUrl: upload.imageUrl } : l);
  await db
    .update(schema.settings)
    .set({ customLocales: updated, updatedAt: Date.now() })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true, flagUrl: upload.imageUrl });
});

admin.delete('/locale-flag/:code', ...base, async (c) => {
  const code = c.req.param('code');
  if (!/^[a-z0-9-]{2,10}$/.test(code)) {
    return c.json({ error: 'Invalid locale code' }, 400);
  }

  const db = c.get('db');
  const [row] = await db
    .select({ customLocales: schema.settings.customLocales })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  const list = row?.customLocales ?? [];
  const target = list.find((l) => l.code === code);
  if (!target) return c.json({ error: 'Custom locale not found' }, 404);

  const bucket = c.env.PUBLIC_MENU_BUCKET;
  if (target.flagUrl && bucket) {
    const oldKey = r2KeyFromUrl(target.flagUrl);
    if (oldKey) await bucket.delete(oldKey);
  }

  const updated = list.map((l) => l.code === code ? { ...l, flagUrl: null } : l);
  await db
    .update(schema.settings)
    .set({ customLocales: updated, updatedAt: Date.now() })
    .where(eq(schema.settings.id, 1));

  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

// ── Analytics ────────────────────────────────────────────────────────

admin.get('/analytics', ...base, async (c) => {
  const db = c.get('db');

  const periodParam = c.req.query('period') ?? '7d';
  const ms = periodToMs(periodParam);
  if (ms === undefined) {
    return c.json({ error: `Invalid period. Valid values: ${VALID_PERIODS.join(', ')}` }, 400);
  }
  const periodMs = ms;

  const limitParam = Number.parseInt(c.req.query('limit') ?? '10', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 10;

  const now = Date.now();
  const { currentStart, prevStart } = computeWindows(now, periodMs);

  const currentViewedRaw = await db
    .select({
      entryId: schema.catalogViews.entryId,
      name: schema.menuEntries.name,
      categoryId: schema.menuEntries.categoryId,
      categoryName: schema.menuCategories.name,
      image: schema.menuEntries.imageUrl,
      viewCount: count(schema.catalogViews.id),
    })
    .from(schema.catalogViews)
    .leftJoin(schema.menuEntries, eq(schema.catalogViews.entryId, schema.menuEntries.id))
    .leftJoin(schema.menuCategories, eq(schema.menuEntries.categoryId, schema.menuCategories.id))
    .where(gte(schema.catalogViews.viewedAt, currentStart))
    .groupBy(schema.catalogViews.entryId, schema.menuEntries.name, schema.menuEntries.categoryId, schema.menuCategories.name, schema.menuEntries.imageUrl)
    .orderBy(desc(count(schema.catalogViews.id)), asc(schema.catalogViews.entryId))
    .limit(limit);

  let prevViewedRaw: Array<{ entryId: string | null; name: string | null; viewCount: number }> = [];
  if (periodMs !== null) {
    prevViewedRaw = await db
      .select({
        entryId: schema.catalogViews.entryId,
        name: schema.menuEntries.name,
        viewCount: count(schema.catalogViews.id),
      })
      .from(schema.catalogViews)
      .leftJoin(schema.menuEntries, eq(schema.catalogViews.entryId, schema.menuEntries.id))
      .where(
        and(
          gte(schema.catalogViews.viewedAt, prevStart),
          lt(schema.catalogViews.viewedAt, currentStart),
        ),
      )
      .groupBy(schema.catalogViews.entryId, schema.menuEntries.name)
      .orderBy(desc(count(schema.catalogViews.id)), asc(schema.catalogViews.entryId));
  }

  const currentViewedNormalised = currentViewedRaw.map((item) => ({
    entryId: item.entryId,
    name: item.name ?? '(deleted)',
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    image: item.image,
    viewCount: item.viewCount,
  }));
  const prevViewedNormalised = prevViewedRaw.map((item) => ({
    entryId: item.entryId,
    name: item.name ?? '(deleted)',
    viewCount: item.viewCount,
  }));
  const viewedItems = computeLeaderboardMovement(currentViewedNormalised, prevViewedNormalised);

  if (periodMs === null) {
    for (const item of viewedItems) {
      item.status = 'same';
      item.delta = null;
      item.previousRank = null;
    }
  }

  let dailyTotals: { date: string; viewCount: number }[] | undefined;
  if (periodParam === '7d' || periodParam === '30d') {
    const dailyRaw = await db
      .select({
        dateBucket: schema.catalogViews.dateBucket,
        viewCount: count(schema.catalogViews.id),
      })
      .from(schema.catalogViews)
      .where(gte(schema.catalogViews.viewedAt, currentStart))
      .groupBy(schema.catalogViews.dateBucket)
      .orderBy(asc(schema.catalogViews.dateBucket));

    const countByBucket = new Map<number, number>();
    for (const row of dailyRaw) {
      countByBucket.set(row.dateBucket, row.viewCount);
    }

    const days = periodParam === '7d' ? 7 : 30;
    dailyTotals = [];
    const oneDay = 24 * 60 * 60 * 1000;
    for (let i = days - 1; i >= 0; i--) {
      const t = now - i * oneDay;
      const d = new Date(t);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const bucket = y * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      dailyTotals.push({ date: `${y}-${m}-${dd}`, viewCount: countByBucket.get(bucket) ?? 0 });
    }
  }

  const menuBreakdownRaw = await db
    .select({
      menuId: schema.menus.id,
      menuCode: schema.menus.code,
      menuTitle: schema.menus.title,
      icon: schema.menus.icon,
      viewCount: count(schema.catalogViews.id),
    })
    .from(schema.catalogViews)
    .innerJoin(schema.menuEntries, eq(schema.catalogViews.entryId, schema.menuEntries.id))
    .innerJoin(schema.menuEntryMemberships, eq(schema.menuEntries.id, schema.menuEntryMemberships.entryId))
    .innerJoin(schema.menus, eq(schema.menuEntryMemberships.menuId, schema.menus.id))
    .where(gte(schema.catalogViews.viewedAt, currentStart))
    .groupBy(schema.menus.id, schema.menus.code, schema.menus.title, schema.menus.icon)
    .orderBy(desc(count(schema.catalogViews.id)));

  const hourExpr = sql<number>`(${schema.catalogViews.viewedAt} / 3600000) % 24`;
  const hourlyRaw = await db
    .select({
      hour: hourExpr,
      viewCount: count(schema.catalogViews.id),
    })
    .from(schema.catalogViews)
    .where(gte(schema.catalogViews.viewedAt, currentStart))
    .groupBy(hourExpr)
    .orderBy(asc(hourExpr));

  const countByHour = new Map<number, number>();
  for (const row of hourlyRaw) {
    countByHour.set(row.hour, row.viewCount);
  }
  const hourlyTotals = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    viewCount: countByHour.get(h) ?? 0,
  }));

  return c.json({
    period: periodParam,
    viewedItems,
    dailyTotals,
    menuBreakdown: menuBreakdownRaw,
    hourlyTotals,
  });
});

// ── Export ───────────────────────────────────────────────────────────

admin.get('/export', ...base, async (c) => {
  const db = c.get('db');

  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  const menus = await db.select().from(schema.menus).orderBy(asc(schema.menus.sortOrder));
  const categories = await db.select().from(schema.menuCategories).orderBy(asc(schema.menuCategories.sortOrder));
  const entries = await db.select().from(schema.menuEntries).orderBy(asc(schema.menuEntries.sortOrder));
  const memberships = await db.select().from(schema.menuEntryMemberships);
  const variants = await db.select().from(schema.menuVariants).orderBy(asc(schema.menuVariants.sortOrder));
  const extras = await db.select().from(schema.menuExtras);

  const date = new Date().toISOString().slice(0, 10);
  c.header('Content-Disposition', `attachment; filename="menu-export-${date}.json"`);

  return c.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      name: row?.name ?? null,
      payoff: row?.payoff ?? null,
      theme: row?.theme ?? null,
      info: row?.info ?? null,
      socials: row?.socials ?? null,
      openingSchedule: row?.openingSchedule ?? null,
      promotionAlert: row?.promotionAlert ?? null,
      chatAgentPrompt: row?.chatAgentPrompt ?? null,
      aiChatEnabled: row?.aiChatEnabled ?? false,
      primaryLocale: row?.primaryLocale ?? 'it',
      enabledLocales: row?.enabledLocales ?? null,
      disabledLocales: row?.disabledLocales ?? [],
      customLocales: row?.customLocales ?? [],
      publicationState: row?.publicationState ?? 'draft',
    },
    menus: menus.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      i18n: m.i18n,
      published: m.published,
      sortOrder: m.sortOrder,
      icon: m.icon,
    })),
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      sortOrder: cat.sortOrder,
      i18n: cat.i18n,
    })),
    entries: entries.map((e) => ({
      id: e.id,
      categoryId: e.categoryId,
      name: e.name,
      description: e.description,
      priceCents: e.price,
      priceUnit: e.priceUnit,
      imageUrl: e.imageUrl,
      outOfStock: e.outOfStock,
      frozen: e.frozen,
      sortOrder: e.sortOrder,
      hidden: e.hidden,
      allergens: e.allergens,
      i18n: e.i18n,
      metadata: e.metadata,
    })),
    memberships: memberships.map((m) => ({
      menuId: m.menuId,
      entryId: m.entryId,
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
  });
});

// ── Translation ──────────────────────────────────────────────────────

const LOCALE_DESCRIPTIONS: Record<string, string> = {
  en: 'English',
  de: 'German (Deutsch)',
  fr: 'French (Français)',
  vec: 'Venetian dialect (Veneto, northeastern Italy — spoken in the Venice region, distinct from standard Italian)',
};

admin.post('/translate', ...base, async (c) => {
  const body = await parseBody(c, TranslateRequestBodySchema);
  if (body instanceof Response) return body;

  const uid = c.get('user').uid;
  const limited = checkRateLimit(`translate:${uid}`, 30, 60_000);
  if (limited) return limited;

  const apiKey = c.env.OPENAI_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'Translation not configured (missing OPENAI_API_KEY)' }, 503);
  }

  const { sourceText, targetLocale, field } = body;
  const localeName = LOCALE_DESCRIPTIONS[targetLocale] || targetLocale;
  const isDesc = field === 'desc';
  const isText = field === 'text';

  const systemPrompt = isText
    ? `You are a professional restaurant menu translator. Translate the following restaurant customer-facing notice from Italian to ${localeName}. Return only the translated text, nothing else. Preserve line breaks and any HTML formatting tags (<b>, <i>, <u>).`
    : isDesc
    ? `You are a professional restaurant menu translator. Translate the following menu item description from Italian to ${localeName}. Return only the translated text, nothing else. Preserve any HTML formatting tags (<b>, <i>, <u>).`
    : `You are a professional restaurant menu translator. Translate the following menu item name from Italian to ${localeName}. Return only the translated name, nothing else.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: sourceText },
      ],
      max_completion_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error('OpenAI translate error:', err);
    return c.json({ error: 'Translation API error' }, 502);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const translatedText = data.choices?.[0]?.message?.content?.trim() ?? '';

  return c.json({ translatedText });
});

// ── Helpers ──────────────────────────────────────────────────────────

async function refreshPublicCatalog(c: Context<AppBindings>): Promise<void> {
  try {
    await warmCatalogAfterMutation(
      c.env,
      c.req.url,
      c.get('db'),
      c.get('user').uid,
    );
  } catch (error) {
    console.error('catalog-cache-refresh-failed', { error });
  }
}

async function setEntryMemberships(db: DbInstance, entryId: string, menuIds: string[]): Promise<void> {
  const unique = Array.from(new Set(menuIds));
  await db
    .delete(schema.menuEntryMemberships)
    .where(eq(schema.menuEntryMemberships.entryId, entryId));
  if (unique.length === 0) return;
  await db
    .insert(schema.menuEntryMemberships)
    .values(unique.map((menuId) => ({ menuId, entryId })));
}

async function setEntryLabelAssignments(db: DbInstance, entryId: string, labelIds: string[]): Promise<void> {
  const unique = Array.from(new Set(labelIds));
  await db.delete(schema.entryLabels).where(eq(schema.entryLabels.entryId, entryId));
  if (unique.length === 0) return;
  await db.insert(schema.entryLabels).values(unique.map((labelId) => ({ entryId, labelId })));
}

async function uploadSettingsImage(
  c: Context<AppBindings>,
  prefix: string,
): Promise<{ imageUrl: string } | { response: Response }> {
  const bucket = c.env.PUBLIC_MENU_BUCKET;
  if (!bucket) return { response: c.json({ error: 'R2 bucket not configured' }, 503) };

  const body = await c.req.arrayBuffer();
  const validation = validateImage(body);
  if ('error' in validation) {
    return { response: c.json({ error: validation.error }, validation.status) };
  }

  const key = `images/settings/${prefix}-${Date.now()}${validation.ext}`;
  await bucket.put(key, body, { httpMetadata: { contentType: validation.type } });

  const r2Base = (c.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!r2Base) return { response: c.json({ error: 'R2_PUBLIC_URL not configured' }, 503) };
  return { imageUrl: `${r2Base}/${key}` };
}

function r2KeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    if (path.startsWith('images/')) return path;
    return null;
  } catch {
    return null;
  }
}

export const adminRoutes = admin;
