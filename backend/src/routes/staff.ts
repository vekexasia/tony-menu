import { Hono } from 'hono';
import { eq, and, asc, inArray, isNull, sql } from 'drizzle-orm';
import { requireDb } from '../middleware/db';
import { requireStaff } from '../middleware/staff-guard';
import { parseBody } from '../lib/validate';
import {
  ConsumeStaffLinkBodySchema,
  ConsumeOrderIntentBodySchema,
  ORDER_STATUS_TRANSITIONS,
  type OrderStatus,
} from '@menu/schemas';
import * as schema from '../db/schema';
import { createOrder } from './orders';
import { buildFloorState } from '../lib/floor';
import { checkRateLimit } from '../lib/rate-limit';
import type { AppBindings } from '../types';
import type { DbInstance } from '../db';

const staff = new Hono<AppBindings>();

const staffBase = [requireDb, requireStaff] as const;

// ── One-use link exchange (public) ───────────────────────────────────

/**
 * POST /staff/consume — exchange a one-use link token for a session token.
 * Atomic claim (WHERE consumed_at IS NULL) so a second exchange fails clearly.
 */
staff.post('/consume', requireDb, async (c) => {
  const body = await parseBody(c, ConsumeStaffLinkBodySchema);
  if (body instanceof Response) return body;

  // Public endpoint — throttle brute-force token guessing per IP.
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const limited = checkRateLimit(`staff-consume:${ip}`, 20, 60_000);
  if (limited) return limited;

  const db = c.get('db');
  const [link] = await db
    .select({
      id: schema.staffLinks.id,
      name: schema.staffLinks.name,
      consumedAt: schema.staffLinks.consumedAt,
      revokedAt: schema.staffLinks.revokedAt,
    })
    .from(schema.staffLinks)
    .where(eq(schema.staffLinks.token, body.token))
    .limit(1);

  if (!link || link.revokedAt !== null) return c.json({ error: 'invalid' }, 404);
  if (link.consumedAt !== null) return c.json({ error: 'consumed' }, 409);

  const sessionToken = crypto.randomUUID();
  const claim = await db
    .update(schema.staffLinks)
    .set({ consumedAt: Date.now(), sessionToken, lastSeenAt: Date.now() })
    .where(and(eq(schema.staffLinks.id, link.id), isNull(schema.staffLinks.consumedAt)));
  if (claim.meta.changes === 0) return c.json({ error: 'consumed' }, 409);

  return c.json({ ok: true, sessionToken, name: link.name });
});

// ── Session check (staff) ────────────────────────────────────────────

/** GET /staff/session — confirms the token is valid; used to gate the web UI. */
staff.get('/session', ...staffBase, (c) => {
  return c.json({ ok: true, name: c.get('staff').name });
});

// ── Floor view (staff) ───────────────────────────────────────────────

/** GET /staff/floor — active tables with at-a-glance state. */
staff.get('/floor', ...staffBase, async (c) => {
  const { areas, tables } = await buildFloorState(c.get('db'), false);
  // Staff sees only active tables; drop the admin-only `active` flag to keep the shape.
  return c.json({ areas, tables: tables.map(({ active, ...t }) => t) });
});

// ── Open / close table sessions (staff) ──────────────────────────────

/** POST /staff/tables/:id/session — open a session (idempotent: returns the open one). */
staff.post('/tables/:id/session', ...staffBase, async (c) => {
  const db = c.get('db');
  const tableId = c.req.param('id');

  const [table] = await db
    .select({ id: schema.tables.id })
    .from(schema.tables)
    .where(eq(schema.tables.id, tableId))
    .limit(1);
  if (!table) return c.json({ error: 'Not Found' }, 404);

  const [open] = await db
    .select({ id: schema.tableSessions.id })
    .from(schema.tableSessions)
    .where(and(eq(schema.tableSessions.tableId, tableId), isNull(schema.tableSessions.closedAt)))
    .limit(1);
  if (open) return c.json({ ok: true, sessionId: open.id });

  const id = crypto.randomUUID();
  await db.insert(schema.tableSessions).values({ id, tableId, openedAt: Date.now() });
  return c.json({ ok: true, sessionId: id }, 201);
});

/**
 * POST /staff/sessions/:id/close — close a session.
 * Blocked (409) while any order is still submitted/ready: the waiter must serve
 * or reject every order first. Simplest sensible rule — no silent auto-serve.
 */
staff.post('/sessions/:id/close', ...staffBase, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');

  const [session] = await db
    .select({ id: schema.tableSessions.id, closedAt: schema.tableSessions.closedAt })
    .from(schema.tableSessions)
    .where(eq(schema.tableSessions.id, sessionId))
    .limit(1);
  if (!session) return c.json({ error: 'Not Found' }, 404);
  if (session.closedAt !== null) return c.json({ ok: true });

  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)` })
    .from(schema.orders)
    .where(and(
      eq(schema.orders.tableSessionId, sessionId),
      inArray(schema.orders.status, ['submitted', 'ready']),
    ));
  if (pending > 0) return c.json({ error: 'pending_orders', pending }, 409);

  await db
    .update(schema.tableSessions)
    .set({ closedAt: Date.now() })
    .where(eq(schema.tableSessions.id, sessionId));
  return c.json({ ok: true });
});

// ── Table session detail (staff) ─────────────────────────────────────

/** GET /staff/sessions/:id — the session's orders with status. */
staff.get('/sessions/:id', ...staffBase, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');

  const [session] = await db
    .select({
      id: schema.tableSessions.id,
      openedAt: schema.tableSessions.openedAt,
      tableId: schema.tables.id,
      tableName: schema.tables.name,
      areaName: schema.areas.name,
    })
    .from(schema.tableSessions)
    .innerJoin(schema.tables, eq(schema.tableSessions.tableId, schema.tables.id))
    .leftJoin(schema.areas, eq(schema.tables.areaId, schema.areas.id))
    .where(eq(schema.tableSessions.id, sessionId))
    .limit(1);
  if (!session) return c.json({ error: 'Not Found' }, 404);

  const orderRows = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.tableSessionId, sessionId))
    .orderBy(asc(schema.orders.createdAt));
  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length > 0
    ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))
    : [];
  const eventRows = orderIds.length > 0
    ? await db
        .select()
        .from(schema.orderEvents)
        .where(inArray(schema.orderEvents.orderId, orderIds))
        .orderBy(asc(schema.orderEvents.createdAt))
    : [];
  const eventsByOrder = new Map<string, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsByOrder.get(e.orderId) ?? [];
    list.push(e);
    eventsByOrder.set(e.orderId, list);
  }
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const i of itemRows) {
    const list = itemsByOrder.get(i.orderId) ?? [];
    list.push(i);
    itemsByOrder.set(i.orderId, list);
  }

  return c.json({
    sessionId: session.id,
    tableId: session.tableId,
    tableName: session.areaName ? `${session.areaName} · ${session.tableName}` : session.tableName,
    openedAt: session.openedAt,
    orders: orderRows.map((o) => ({
      id: o.id,
      dailyNumber: o.dailyNumber,
      status: o.status,
      createdAt: o.createdAt,
      items: (itemsByOrder.get(o.id) ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      })),
      events: (eventsByOrder.get(o.id) ?? []).map((e) => ({
        status: e.status,
        actor: e.actor,
        actorName: e.actorName,
        at: e.createdAt,
      })),
    })),
  });
});

// ── Mark served (staff) ──────────────────────────────────────────────

/**
 * PATCH /staff/orders/:orderId/serve — advance ready → served only.
 * Deliberately narrower than the admin transition endpoint: staff can't reject
 * or reset an order, only confirm delivery.
 */
staff.patch('/orders/:orderId/serve', ...staffBase, async (c) => {
  const db = c.get('db');
  const orderId = c.req.param('orderId');

  const [order] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order) return c.json({ error: 'Not Found' }, 404);

  const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (order.status !== 'ready' || !allowed.includes('served')) {
    return c.json({ error: 'illegal_transition', from: order.status, to: 'served' }, 409);
  }

  await db.batch([
    db
      .update(schema.orders)
      .set({ status: 'served', updatedAt: Date.now() })
      .where(eq(schema.orders.id, orderId)),
    db.insert(schema.orderEvents).values({
      id: crypto.randomUUID(),
      orderId,
      status: 'served',
      actor: 'staff',
      actorName: c.get('staff').name,
    }),
  ]);
  return c.json({ ok: true, status: 'served' });
});

// ── Order intents review/consume (staff) — moved from admin (#15) ─────

/**
 * GET /staff/order-intents/:token — review an intent, lines re-resolved against
 * the CURRENT menu. Waiters (not admins) review intents, so this is staff-gated.
 */
staff.get('/order-intents/:token', ...staffBase, async (c) => {
  const db = c.get('db');
  const token = c.req.param('token');

  const [intent] = await db
    .select()
    .from(schema.orderIntents)
    .where(eq(schema.orderIntents.id, token))
    .limit(1);
  if (!intent) return c.json({ error: 'Not Found' }, 404);

  const rawLines = intent.lines ?? [];
  const entryIds = rawLines.map((l) => l.entryId);
  const entries = entryIds.length > 0
    ? await db
        .select({
          id: schema.menuEntries.id,
          name: schema.menuEntries.name,
          price: schema.menuEntries.price,
          hidden: schema.menuEntries.hidden,
          outOfStock: schema.menuEntries.outOfStock,
        })
        .from(schema.menuEntries)
        .where(inArray(schema.menuEntries.id, entryIds))
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const status = intent.consumedAt !== null
    ? 'consumed'
    : (intent.expiresAt < Date.now() ? 'expired' : 'pending');

  return c.json({
    token,
    status,
    expiresAt: intent.expiresAt,
    consumedAt: intent.consumedAt,
    lines: rawLines.map((line) => {
      const entry = entryById.get(line.entryId);
      return {
        entryId: line.entryId,
        quantity: line.quantity,
        name: entry?.name ?? null,
        price: entry?.price ?? null,
        unavailable: !entry || entry.hidden || entry.outOfStock,
      };
    }),
  });
});

/**
 * POST /staff/order-intents/:token/consume — consume into a real order via the
 * shared createOrder path. A waiter must bind every consumed QR to a table.
 */
staff.post('/order-intents/:token/consume', ...staffBase, async (c) => {
  const db = c.get('db');
  const token = c.req.param('token');

  const raw = await c.req.json().catch(() => ({}));
  const parsed = ConsumeOrderIntentBodySchema.safeParse(raw ?? {});
  if (!parsed.success) return c.json({ error: 'Invalid request' }, 400);
  const tableSessionId = parsed.data.tableSessionId;
  const overrideLines = parsed.data.lines;
  const [intent] = await db
    .select()
    .from(schema.orderIntents)
    .where(eq(schema.orderIntents.id, token))
    .limit(1);
  if (!intent) return c.json({ error: 'Not Found' }, 404);
  if (intent.consumedAt !== null) return c.json({ error: 'consumed' }, 409);
  if (intent.expiresAt < Date.now()) return c.json({ error: 'expired' }, 409);

  const claim = await db
    .update(schema.orderIntents)
    .set({ consumedAt: Date.now() })
    .where(and(eq(schema.orderIntents.id, token), isNull(schema.orderIntents.consumedAt)));
  if (claim.meta.changes === 0) return c.json({ error: 'consumed' }, 409);

  let result;
  try {
    result = await createOrder(db, `intent:${token}`, overrideLines ?? intent.lines ?? [], tableSessionId, 'staff', c.get('staff').name);
  } catch (error) {
    await releaseClaim(db, token);
    throw error;
  }
  if ('error' in result) {
    await releaseClaim(db, token);
    return c.json(result, 409);
  }
  return c.json(result);
});

async function releaseClaim(db: DbInstance, token: string): Promise<void> {
  await db
    .update(schema.orderIntents)
    .set({ consumedAt: null })
    .where(eq(schema.orderIntents.id, token));
}

export const staffRoutes = staff;
