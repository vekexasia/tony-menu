import { eq, asc, inArray, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

/**
 * Shared floor-state builder (#15). Staff and admin both need per-table
 * at-a-glance state (open session, oldest submitted order); the only difference
 * is that admin sees inactive tables (dimmed) while staff sees only active ones.
 * Every tile carries `active`; the staff route excludes inactive tables.
 */
export async function buildFloorState(db: DbInstance, includeInactive: boolean) {
  const tableRows = includeInactive
    ? await db
        .select()
        .from(schema.tables)
        .orderBy(asc(schema.tables.sortOrder), asc(schema.tables.createdAt))
    : await db
        .select()
        .from(schema.tables)
        .where(eq(schema.tables.active, true))
        .orderBy(asc(schema.tables.sortOrder), asc(schema.tables.createdAt));

  const areaRows = await db
    .select({ id: schema.areas.id, name: schema.areas.name, sortOrder: schema.areas.sortOrder })
    .from(schema.areas)
    .orderBy(asc(schema.areas.sortOrder), asc(schema.areas.createdAt));

  const openSessions = await db
    .select()
    .from(schema.tableSessions)
    .where(isNull(schema.tableSessions.closedAt));
  const sessionByTable = new Map(openSessions.map((s) => [s.tableId, s]));

  const sessionIds = openSessions.map((s) => s.id);
  const orderRows = sessionIds.length > 0
    ? await db
        .select({ id: schema.orders.id, tableSessionId: schema.orders.tableSessionId, status: schema.orders.status, createdAt: schema.orders.createdAt })
        .from(schema.orders)
        .where(inArray(schema.orders.tableSessionId, sessionIds))
    : [];

  const orderIds = orderRows.map((o) => o.id);
  const itemRows = includeInactive && orderIds.length > 0
    ? await db
        .select({ orderId: schema.orderItems.orderId, price: schema.orderItems.price, quantity: schema.orderItems.quantity })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.orderId, orderIds))
    : [];
  const orderTotal = new Map<string, number>();
  for (const item of itemRows) orderTotal.set(item.orderId, (orderTotal.get(item.orderId) ?? 0) + item.price * item.quantity);

  const checks = includeInactive && sessionIds.length > 0
    ? await db
        .select()
        .from(schema.checks)
        .where(inArray(schema.checks.tableSessionId, sessionIds))
    : [];
  const checkBySession = new Map<string, typeof checks[number]>();
  for (const check of checks) {
    const prev = checkBySession.get(check.tableSessionId);
    if (!prev || check.createdAt > prev.createdAt) checkBySession.set(check.tableSessionId, check);
  }

  const checkTotal = (check: typeof checks[number]): number => {
    const lines = check.lines ?? [];
    const adjustments = check.adjustments ?? [];
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const discount = check.discount
      ? check.discount.type === 'percent' ? Math.round(subtotal * check.discount.value / 100) : check.discount.value
      : 0;
    const adjusted = subtotal - discount + adjustments.reduce((sum, a) => sum + a.amount, 0);
    return Math.max(0, adjusted);
  };

  const counts = new Map<string, { orderCount: number; readyCount: number; oldestSubmittedAt: number | null; provisionalTotal: number }>();
  for (const o of orderRows) {
    if (!o.tableSessionId) continue;
    const c = counts.get(o.tableSessionId) ?? { orderCount: 0, readyCount: 0, oldestSubmittedAt: null, provisionalTotal: 0 };
    // "Open orders" = anything not served/rejected; "ready" = ready to serve.
    if (o.status === 'submitted' || o.status === 'ready') c.orderCount++;
    if (o.status !== 'rejected') c.provisionalTotal += orderTotal.get(o.id) ?? 0;
    if (o.status === 'ready') c.readyCount++;
    if (o.status === 'submitted' && (c.oldestSubmittedAt === null || o.createdAt < c.oldestSubmittedAt)) {
      c.oldestSubmittedAt = o.createdAt;
    }
    counts.set(o.tableSessionId, c);
  }

  return {
    areas: areaRows,
    tables: tableRows.map((t) => {
      const session = sessionByTable.get(t.id);
      const count = session ? counts.get(session.id) : undefined;
      return {
        id: t.id,
        name: t.name,
        active: t.active,
        sessionId: session?.id ?? null,
        openedAt: session?.openedAt ?? null,
        orderCount: count?.orderCount ?? 0,
        readyCount: count?.readyCount ?? 0,
        areaId: t.areaId,
        x: t.x,
        y: t.y,
        shape: t.shape,
        ...(includeInactive ? {
          provisionalTotal: count?.provisionalTotal ?? 0,
          checkStatus: session ? checkBySession.get(session.id)?.status ?? null : null,
          checkTotal: session && checkBySession.has(session.id) ? checkTotal(checkBySession.get(session.id)!) : null,
        } : {}),
        oldestSubmittedAt: count?.oldestSubmittedAt ?? null,
      };
    }),
  };
}
