import { asc, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

export async function buildAdminOrdersForDay(db: DbInstance, day: number) {
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
  const itemRows = orderIds.length > 0 ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds)) : [];
  const itemIds = itemRows.map((i) => i.id);
  const destRows = itemIds.length > 0 ? await db.select().from(schema.orderItemDestinations).where(inArray(schema.orderItemDestinations.orderItemId, itemIds)) : [];
  const eventRows = orderIds.length > 0 ? await db.select().from(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds)) : [];

  const submittedBy = new Map<string, string>();
  for (const e of eventRows) if (e.status === 'submitted' && e.actorName) submittedBy.set(e.orderId, e.actorName);

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

  return orderRows.map((o) => ({
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
  }));
}

export async function buildStaffSessionDetail(db: DbInstance, sessionId: string) {
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
  if (!session) return null;

  const orderRows = await db.select().from(schema.orders).where(eq(schema.orders.tableSessionId, sessionId)).orderBy(asc(schema.orders.createdAt));
  const orderIds = orderRows.map((o) => o.id);
  const itemRows = orderIds.length > 0 ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds)) : [];
  const eventRows = orderIds.length > 0
    ? await db.select().from(schema.orderEvents).where(inArray(schema.orderEvents.orderId, orderIds)).orderBy(asc(schema.orderEvents.createdAt))
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

  return {
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
  };
}
