import { Hono, type Context } from 'hono';
import { eq, desc, asc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin-guard';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import {
  UpdateOrderStatusBodySchema,
  SetDestinationPrintedBodySchema,
  CreateOrderDestinationBodySchema,
  UpdateOrderDestinationBodySchema,
} from '@menu/schemas';
import * as schema from '../db/schema';
import { refreshCatalogArtifacts } from './catalog';
import { buildAdminOrdersForDay, currentOrderDay, transitionOrderStatus } from '../orders';
import type { AppBindings } from '../types';

/**
 * Kitchen board + order destinations admin routes (#18).
 * Mounted under /admin from admin.ts.
 */
const admin = new Hono<AppBindings>();

const base = [requireAuth, requireDb, requireAdmin] as const;

// ── Kitchen board ────────────────────────────────────────────────────

/** Orders for one day (default today) with items and per-destination rows. */
admin.get('/orders', ...base, async (c) => {
  const db = c.get('db');
  const day = Number(c.req.query('day')) || currentOrderDay(new Date(), c.get('config').orderTimeZone);
  return c.json({ day, orders: await buildAdminOrdersForDay(db, day) });
});

/** Whole-order status transition: submitted → ready → served, or reject with reason. */
admin.patch('/orders/:orderId/status', ...base, async (c) => {
  const orderId = c.req.param('orderId');
  const body = await parseBody(c, UpdateOrderStatusBodySchema);
  if (body instanceof Response) return body;

  const result = await transitionOrderStatus(c.get('db'), orderId, body.status, 'admin', null, body.rejectReason);
  if (result.error === 'not_found') return c.json({ error: 'Not Found' }, 404);
  if (result.error === 'illegal_transition') {
    return c.json({ error: 'illegal_transition', from: result.from, to: result.to }, 409);
  }
  return c.json({ ok: true, status: result.status });
});

/** Per-department printed/done toggle — independent per destination row. */
admin.patch('/order-item-destinations/:id/printed', ...base, async (c) => {
  const id = c.req.param('id');
  const body = await parseBody(c, SetDestinationPrintedBodySchema);
  if (body instanceof Response) return body;

  const db = c.get('db');
  const printedAt = body.printed ? Date.now() : null;
  const result = await db
    .update(schema.orderItemDestinations)
    .set({ printedAt })
    .where(eq(schema.orderItemDestinations.id, id))
    .returning({ id: schema.orderItemDestinations.id });
  if (result.length === 0) return c.json({ error: 'Not Found' }, 404);

  return c.json({ ok: true, printedAt });
});

// ── Order destinations CRUD ──────────────────────────────────────────

admin.get('/order-destinations', ...base, async (c) => {
  const rows = await c.get('db')
    .select()
    .from(schema.orderDestinations)
    .orderBy(asc(schema.orderDestinations.sortOrder), asc(schema.orderDestinations.createdAt));
  return c.json({ destinations: rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder })) });
});

admin.post('/order-destinations', ...base, async (c) => {
  const body = await parseBody(c, CreateOrderDestinationBodySchema);
  if (body instanceof Response) return body;
  const db = c.get('db');
  const [last] = await db
    .select({ maxOrder: schema.orderDestinations.sortOrder })
    .from(schema.orderDestinations)
    .orderBy(desc(schema.orderDestinations.sortOrder))
    .limit(1) as Array<{ maxOrder: number | null }>;
  const id = crypto.randomUUID();
  await db.insert(schema.orderDestinations).values({
    id,
    name: body.name,
    sortOrder: (last?.maxOrder ?? -1) + 1,
  });
  return c.json({ ok: true, id }, 201);
});

admin.patch('/order-destinations/:id', ...base, async (c) => {
  const id = c.req.param('id');
  const body = await parseBody(c, UpdateOrderDestinationBodySchema);
  if (body instanceof Response) return body;
  await c.get('db')
    .update(schema.orderDestinations)
    .set({ name: body.name, updatedAt: Date.now() })
    .where(eq(schema.orderDestinations.id, id));
  return c.json({ ok: true });
});

admin.delete('/order-destinations/:id', ...base, async (c) => {
  const id = c.req.param('id');
  // FK cascade removes entry_destinations rows; order_item_destinations keep
  // their frozen destinationName with destination_id SET NULL.
  await c.get('db').delete(schema.orderDestinations).where(eq(schema.orderDestinations.id, id));
  // The catalog payload only carries per-entry destinationIds, so create and
  // rename never change it — only delete does (cascade drops assignments).
  await refreshPublicCatalog(c);
  return c.json({ ok: true });
});

async function refreshPublicCatalog(c: Context<AppBindings>): Promise<void> {
  try {
    await refreshCatalogArtifacts(c.env, c.req.url, c.get('db'), c.get('user').uid);
  } catch (error) {
    console.error('catalog-cache-refresh-failed', { error });
  }
}

export const adminOrderRoutes = admin;
