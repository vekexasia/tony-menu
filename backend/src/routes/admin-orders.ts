import { Hono, type Context } from 'hono';
import { eq, desc, asc, inArray } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin-guard';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import {
  ORDER_STATUS_TRANSITIONS,
  UpdateOrderStatusBodySchema,
  SetDestinationPrintedBodySchema,
  CreateOrderDestinationBodySchema,
  UpdateOrderDestinationBodySchema,
  type OrderStatus,
} from '@menu/schemas';
import * as schema from '../db/schema';
import { refreshCatalogArtifacts } from './catalog';
import { currentOrderDay } from './orders';
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
  const day = Number(c.req.query('day')) || currentOrderDay();

  const orderRows = await db
    .select({
      id: schema.orders.id,
      dailyNumber: schema.orders.dailyNumber,
      status: schema.orders.status,
      rejectReason: schema.orders.rejectReason,
      createdAt: schema.orders.createdAt,
      tableName: schema.tables.name,
      areaName: schema.areas.name,
      updatedAt: schema.orders.updatedAt,
    })
    .from(schema.orders)
    .leftJoin(schema.tableSessions, eq(schema.orders.tableSessionId, schema.tableSessions.id))
    .leftJoin(schema.tables, eq(schema.tableSessions.tableId, schema.tables.id))
    .leftJoin(schema.areas, eq(schema.tables.areaId, schema.areas.id))
    .where(eq(schema.orders.orderDay, day))
    .orderBy(desc(schema.orders.dailyNumber));

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length > 0
    ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
    : [];
  const itemIds = itemRows.map((i) => i.id);
  const destRows = itemIds.length > 0
    ? await db.select().from(schema.orderItemDestinations).where(inArray(schema.orderItemDestinations.orderItemId, itemIds))
    : [];
  const eventRows = orderIds.length > 0
    ? await db.select().from(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds))
    : [];
  const submittedBy = new Map<string, string>();
  for (const e of eventRows) {
    if (e.status === 'submitted' && e.actorName) submittedBy.set(e.orderId, e.actorName);
  }

  const destsByItem = new Map<string, typeof destRows>();
  for (const d of destRows) {
    const list = destsByItem.get(d.orderItemId) ?? [];
    list.push(d);
    destsByItem.set(d.orderItemId, list);
  }
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const i of itemRows) {
    const list = itemsByOrder.get(i.orderId) ?? [];
    list.push(i);
    itemsByOrder.set(i.orderId, list);
  }

  return c.json({
    day,
    orders: orderRows.map((o) => ({
      id: o.id,
      dailyNumber: o.dailyNumber,
      status: o.status,
      rejectReason: o.rejectReason,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      tableName: o.tableName ? (o.areaName ? `${o.areaName} · ${o.tableName}` : o.tableName) : null,
      submittedBy: submittedBy.get(o.id) ?? null,
      items: (itemsByOrder.get(o.id) ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        destinations: (destsByItem.get(i.id) ?? []).map((d) => ({
          id: d.id,
          destinationId: d.destinationId,
          destinationName: d.destinationName,
          printedAt: d.printedAt,
        })),
      })),
    })),
  });
});

/** Whole-order status transition: submitted → ready → served, or reject with reason. */
admin.patch('/orders/:orderId/status', ...base, async (c) => {
  const orderId = c.req.param('orderId');
  const body = await parseBody(c, UpdateOrderStatusBodySchema);
  if (body instanceof Response) return body;

  const db = c.get('db');
  const [order] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order) return c.json({ error: 'Not Found' }, 404);

  const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(body.status)) {
    return c.json({ error: 'illegal_transition', from: order.status, to: body.status }, 409);
  }

  await db.batch([
    db
      .update(schema.orders)
      .set({
        status: body.status,
        rejectReason: body.status === 'rejected' ? body.rejectReason : null,
        updatedAt: Date.now(),
      })
      .where(eq(schema.orders.id, orderId)),
    db.insert(schema.orderEvents).values({
      id: crypto.randomUUID(),
      orderId,
      status: body.status,
      actor: 'admin',
      actorName: null,
    }),
  ]);

  return c.json({ ok: true, status: body.status });
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
