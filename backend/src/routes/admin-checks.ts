import { Hono } from 'hono';
import { eq, and, asc, desc, inArray, sql, isNull } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin-guard';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import { z } from 'zod';
import { UpdateCheckBodySchema, SettleCheckBodySchema, computeCheckTotals, type CheckDTO, type CheckLine } from '@menu/schemas';
import * as schema from '../db/schema';
import type { AppBindings } from '../types';
import type { DbInstance } from '../db';
import { createOrder } from '../orders';

/**
 * Checks (conto, #15 follow-up): create/settle/void a table session's bill, plus
 * the admin table detail page. Mounted under /admin. All routes ...base-guarded.
 */
const admin = new Hono<AppBindings>();

const base = [requireAuth, requireDb, requireAdmin] as const;


const AdminOrderBodySchema = z.object({
  lines: z.array(z.object({ entryId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1),
});


type CheckRow = typeof schema.checks.$inferSelect;

function toCheckDTO(row: CheckRow): CheckDTO {
  const lines = row.lines ?? [];
  const adjustments = row.adjustments ?? [];
  const { subtotal, total } = computeCheckTotals(lines, row.discount ?? null, adjustments);
  return {
    id: row.id,
    status: row.status as CheckDTO['status'],
    lines,
    discount: row.discount ?? null,
    adjustments,
    subtotal,
    total,
    createdAt: row.createdAt,
    settledAt: row.settledAt,
    paymentMethod: row.paymentMethod as CheckDTO['paymentMethod'],
    note: row.note,
    voidedAt: row.voidedAt,
  };
}

/** Freeze the session's non-rejected orders into snapshot lines (cents). */
async function snapshotLines(db: DbInstance, sessionId: string): Promise<CheckLine[]> {
  const rows = await db
    .select({ name: schema.orderItems.name, price: schema.orderItems.price, quantity: schema.orderItems.quantity })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
    .where(and(
      eq(schema.orders.tableSessionId, sessionId),
      sql`${schema.orders.status} != 'rejected'`,
    ))
    .orderBy(asc(schema.orderItems.createdAt));
  return rows.map((r) => ({ name: r.name, quantity: r.quantity, unitPrice: r.price }));
}

/** Live provisional total (cents) from non-rejected orders — no snapshot. */
function provisionalTotal(lines: CheckLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
}

// ── Admin table detail ──────────────────────────────────────────────

/** GET /admin/tables/:id — table + current session (orders/check) + history. */
admin.get('/tables/:id', ...base, async (c) => {
  const db = c.get('db');
  const tableId = c.req.param('id');

  const [table] = await db
    .select({
      id: schema.tables.id,
      name: schema.tables.name,
      active: schema.tables.active,
      shape: schema.tables.shape,
      areaName: schema.areas.name,
    })
    .from(schema.tables)
    .leftJoin(schema.areas, eq(schema.tables.areaId, schema.areas.id))
    .where(eq(schema.tables.id, tableId))
    .limit(1);
  if (!table) return c.json({ error: 'Not Found' }, 404);

  const sessionRows = await db
    .select({ id: schema.tableSessions.id, openedAt: schema.tableSessions.openedAt, closedAt: schema.tableSessions.closedAt })
    .from(schema.tableSessions)
    .where(eq(schema.tableSessions.tableId, tableId))
    .orderBy(desc(schema.tableSessions.openedAt))
    .limit(20);

  const sessionIds = sessionRows.map((s) => s.id);
  const checkRows = sessionIds.length > 0
    ? await db.select().from(schema.checks).where(inArray(schema.checks.tableSessionId, sessionIds))
    : [];
  // Newest check per session wins (open check is the current one).
  const checkBySession = new Map<string, CheckRow>();
  for (const ch of checkRows) {
    const prev = checkBySession.get(ch.tableSessionId);
    if (!prev || ch.createdAt > prev.createdAt) checkBySession.set(ch.tableSessionId, ch);
  }

  const open = sessionRows.find((s) => s.closedAt === null) ?? null;
  let currentSession = null;
  if (open) {
    const orders = await loadSessionOrders(db, open.id);
    const openCheck = checkRows.find((ch) => ch.tableSessionId === open.id && ch.status === 'open') ?? null;
    const liveLines = await snapshotLines(db, open.id);
    currentSession = {
      sessionId: open.id,
      openedAt: open.openedAt,
      orders,
      check: openCheck ? toCheckDTO(openCheck) : null,
      provisionalTotal: provisionalTotal(liveLines),
    };
  }

  const history = sessionRows
    .filter((s) => s.closedAt !== null)
    .map((s) => {
      const ch = checkBySession.get(s.id);
      return { sessionId: s.id, openedAt: s.openedAt, closedAt: s.closedAt, check: ch ? toCheckDTO(ch) : null };
    });

  return c.json({
    table: { id: table.id, name: table.name, areaName: table.areaName, active: table.active, shape: table.shape },
    currentSession,
    history,
  });
});

/** Same order shape as the staff session detail. */
async function loadSessionOrders(db: DbInstance, sessionId: string) {
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
    ? await db.select().from(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds)).orderBy(asc(schema.orderEvents.createdAt))
    : [];
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const i of itemRows) {
    const list = itemsByOrder.get(i.orderId) ?? [];
    list.push(i);
    itemsByOrder.set(i.orderId, list);
  }
  const eventsByOrder = new Map<string, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsByOrder.get(e.orderId) ?? [];
    list.push(e);
    eventsByOrder.set(e.orderId, list);
  }
  return orderRows.map((o) => ({
    id: o.id,
    dailyNumber: o.dailyNumber,
    status: o.status,
    createdAt: o.createdAt,
    items: (itemsByOrder.get(o.id) ?? []).map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
    events: (eventsByOrder.get(o.id) ?? []).map((e) => ({ status: e.status, actor: e.actor, actorName: e.actorName, at: e.createdAt })),
  }));
}


/** POST /admin/tables/:id/session — open or return the current table session. */
admin.post('/tables/:id/session', ...base, async (c) => {
  const db = c.get('db');
  const tableId = c.req.param('id');
  const [table] = await db.select({ id: schema.tables.id, active: schema.tables.active }).from(schema.tables).where(eq(schema.tables.id, tableId)).limit(1);
  if (!table) return c.json({ error: 'Not Found' }, 404);
  if (!table.active) return c.json({ error: 'inactive_table' }, 409);

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

/** POST /admin/sessions/:id/orders — admin appends an order to an open table session. */
admin.post('/sessions/:id/orders', ...base, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');
  const body = await parseBody(c, AdminOrderBodySchema);
  if (body instanceof Response) return body;

  const result = await createOrder(db, `admin:${sessionId}:${crypto.randomUUID()}`, body.lines, sessionId, 'admin', null, c.get('config').orderTimeZone);
  if ('error' in result) {
    const status = result.error === 'stale_items' ? 409 : 409;
    return c.json(result, status);
  }
  return c.json(result, 201);
});

// ── Check lifecycle ─────────────────────────────────────────────────

/** POST /admin/sessions/:id/check — open a check (max one open per session). */
admin.post('/sessions/:id/check', ...base, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');

  const [session] = await db
    .select({ id: schema.tableSessions.id, closedAt: schema.tableSessions.closedAt })
    .from(schema.tableSessions)
    .where(eq(schema.tableSessions.id, sessionId))
    .limit(1);
  if (!session) return c.json({ error: 'Not Found' }, 404);
  if (session.closedAt !== null) return c.json({ error: 'session_closed' }, 409);

  const [existing] = await db
    .select({ id: schema.checks.id })
    .from(schema.checks)
    .where(and(eq(schema.checks.tableSessionId, sessionId), eq(schema.checks.status, 'open')))
    .limit(1);
  if (existing) return c.json({ error: 'check_open' }, 409);

  const lines = await snapshotLines(db, sessionId);
  const id = crypto.randomUUID();
  await db.insert(schema.checks).values({ id, tableSessionId: sessionId, status: 'open', lines, adjustments: [] });
  const [row] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  return c.json(toCheckDTO(row), 201);
});

/** PATCH /admin/checks/:id — edit discount/adjustments while open. */
admin.patch('/checks/:id', ...base, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await parseBody(c, UpdateCheckBodySchema);
  if (body instanceof Response) return body;

  const [row] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  if (!row) return c.json({ error: 'Not Found' }, 404);
  if (row.status !== 'open') return c.json({ error: 'not_open' }, 409);

  const updates: Partial<CheckRow> = {};
  if (body.discount !== undefined) updates.discount = body.discount;
  if (body.adjustments !== undefined) updates.adjustments = body.adjustments;
  if (Object.keys(updates).length > 0) {
    await db.update(schema.checks).set(updates).where(eq(schema.checks.id, id));
  }
  const [updated] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  return c.json(toCheckDTO(updated));
});

/** POST /admin/checks/:id/settle — settle the check AND close the session (atomic). */
admin.post('/checks/:id/settle', ...base, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [row] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  if (!row) return c.json({ error: 'Not Found' }, 404);
  if (row.status !== 'open') return c.json({ error: 'not_open' }, 409);

  const body = await parseBody(c, SettleCheckBodySchema);
  if (body instanceof Response) return body;
  const now = Date.now();
  await db.batch([
    db.update(schema.checks).set({ status: 'settled', settledAt: now, paymentMethod: body.paymentMethod, note: body.note ?? null }).where(eq(schema.checks.id, id)),
    db.update(schema.tableSessions).set({ closedAt: now }).where(eq(schema.tableSessions.id, row.tableSessionId)),
  ]);
  const [updated] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  return c.json(toCheckDTO(updated));
});

/** POST /admin/checks/:id/void — void the check; the session stays open. */
admin.post('/checks/:id/void', ...base, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const [row] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  if (!row) return c.json({ error: 'Not Found' }, 404);
  if (row.status !== 'open') return c.json({ error: 'not_open' }, 409);

  await db.update(schema.checks).set({ status: 'voided', voidedAt: Date.now() }).where(eq(schema.checks.id, id));
  const [updated] = await db.select().from(schema.checks).where(eq(schema.checks.id, id)).limit(1);
  return c.json(toCheckDTO(updated));
});

/**
 * POST /admin/sessions/:id/close — manual close (no check). Refuses while an open
 * check exists (409 check_open) or any order is submitted/ready (409 active_orders).
 */
admin.post('/sessions/:id/close', ...base, async (c) => {
  const db = c.get('db');
  const sessionId = c.req.param('id');

  const [session] = await db
    .select({ id: schema.tableSessions.id, closedAt: schema.tableSessions.closedAt })
    .from(schema.tableSessions)
    .where(eq(schema.tableSessions.id, sessionId))
    .limit(1);
  if (!session) return c.json({ error: 'Not Found' }, 404);
  if (session.closedAt !== null) return c.json({ ok: true });

  const [openCheck] = await db
    .select({ id: schema.checks.id })
    .from(schema.checks)
    .where(and(eq(schema.checks.tableSessionId, sessionId), eq(schema.checks.status, 'open')))
    .limit(1);
  if (openCheck) return c.json({ error: 'check_open' }, 409);

  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)` })
    .from(schema.orders)
    .where(and(eq(schema.orders.tableSessionId, sessionId), inArray(schema.orders.status, ['submitted', 'ready'])));
  if (pending > 0) return c.json({ error: 'active_orders', pending }, 409);

  await db.update(schema.tableSessions).set({ closedAt: Date.now() }).where(eq(schema.tableSessions.id, sessionId));
  return c.json({ ok: true });
});

export const adminChecksRoutes = admin;
