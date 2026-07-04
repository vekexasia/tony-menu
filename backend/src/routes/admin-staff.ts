import { Hono } from 'hono';
import { eq, asc, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin-guard';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import {
  CreateStaffLinkBodySchema,
  CreateTableBodySchema,
  UpdateTableBodySchema,
} from '@menu/schemas';
import * as schema from '../db/schema';
import type { AppBindings } from '../types';

/**
 * Admin management for waiter mode (#15): named staff links and tables CRUD.
 * Mounted under /admin from admin.ts.
 */
const admin = new Hono<AppBindings>();

const base = [requireAuth, requireDb, requireAdmin] as const;

// ── Staff links ──────────────────────────────────────────────────────

/** List links with name/created/consumed/lastSeen/revoked — never the token. */
admin.get('/staff-links', ...base, async (c) => {
  const rows = await c.get('db')
    .select({
      id: schema.staffLinks.id,
      name: schema.staffLinks.name,
      createdAt: schema.staffLinks.createdAt,
      consumedAt: schema.staffLinks.consumedAt,
      lastSeenAt: schema.staffLinks.lastSeenAt,
      revokedAt: schema.staffLinks.revokedAt,
    })
    .from(schema.staffLinks)
    .orderBy(desc(schema.staffLinks.createdAt));
  return c.json({ links: rows });
});

/** Create a named link; the opaque token is returned once and never stored plaintext-visible again. */
admin.post('/staff-links', ...base, async (c) => {
  const body = await parseBody(c, CreateStaffLinkBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  await db.insert(schema.staffLinks).values({ id, name: body.name, token });
  return c.json({ ok: true, id, token }, 201);
});

/** Revoke: sets revokedAt, which kills the session immediately even if consumed. */
admin.post('/staff-links/:id/revoke', ...base, async (c) => {
  const id = c.req.param('id');
  const result = await c.get('db')
    .update(schema.staffLinks)
    .set({ revokedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(schema.staffLinks.id, id))
    .returning({ id: schema.staffLinks.id });
  if (result.length === 0) return c.json({ error: 'Not Found' }, 404);
  return c.json({ ok: true });
});

// ── Tables CRUD ──────────────────────────────────────────────────────

admin.get('/tables', ...base, async (c) => {
  const rows = await c.get('db')
    .select()
    .from(schema.tables)
    .orderBy(asc(schema.tables.sortOrder), asc(schema.tables.createdAt));
  return c.json({ tables: rows.map((r) => ({ id: r.id, name: r.name, active: r.active, sortOrder: r.sortOrder })) });
});

admin.post('/tables', ...base, async (c) => {
  const body = await parseBody(c, CreateTableBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');
  const [last] = await db
    .select({ maxOrder: schema.tables.sortOrder })
    .from(schema.tables)
    .orderBy(desc(schema.tables.sortOrder))
    .limit(1) as Array<{ maxOrder: number | null }>;
  const id = crypto.randomUUID();
  await db.insert(schema.tables).values({
    id,
    name: body.name,
    active: body.active ?? true,
    sortOrder: (last?.maxOrder ?? -1) + 1,
  });
  return c.json({ ok: true, id }, 201);
});

admin.patch('/tables/:id', ...base, async (c) => {
  const id = c.req.param('id');
  const body = await parseBody(c, UpdateTableBodySchema);
  if (body instanceof Response) return body;
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.active !== undefined) updates.active = body.active;
  await c.get('db').update(schema.tables).set(updates).where(eq(schema.tables.id, id));
  return c.json({ ok: true });
});

admin.delete('/tables/:id', ...base, async (c) => {
  const id = c.req.param('id');
  // FK cascade drops table_sessions; orders keep tableSessionId SET NULL.
  await c.get('db').delete(schema.tables).where(eq(schema.tables.id, id));
  return c.json({ ok: true });
});

export const adminStaffRoutes = admin;
