import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

/** YYYYMMDD integer bucket in the restaurant timezone. */
export function currentOrderDay(now = new Date(), timeZone = 'UTC'): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return value('year') * 10000 + value('month') * 100 + value('day');
}

/** Intents expire 30 minutes after creation (#19). */
export const INTENT_TTL_MS = 30 * 60_000;

const MAX_NUMBERING_RETRIES = 3;

export type CreateOrderResult =
  | { ok: true; orderId: string; dailyNumber: number }
  | { error: 'stale_items'; staleEntryIds: string[] }
  | { error: 'invalid_table_session' }
  | { error: 'check_open' };

/** Shared order creation path for diner, staff, and admin submits. */
export async function createOrder(
  db: DbInstance,
  idempotencyKey: string,
  rawLines: { entryId: string; quantity: number }[],
  tableSessionId?: string | null,
  actor: 'diner' | 'staff' | 'admin' = tableSessionId ? 'staff' : 'diner',
  actorName?: string | null,
  orderTimeZone = 'UTC',
): Promise<CreateOrderResult> {
  const existing = await findByIdempotencyKey(db, idempotencyKey);
  if (existing) return existing;

  if (tableSessionId != null) {
    const [session] = await db
      .select({ id: schema.tableSessions.id })
      .from(schema.tableSessions)
      .where(and(eq(schema.tableSessions.id, tableSessionId), isNull(schema.tableSessions.closedAt)))
      .limit(1);
    if (!session) return { error: 'invalid_table_session' };

    const [openCheck] = await db
      .select({ id: schema.checks.id })
      .from(schema.checks)
      .where(and(eq(schema.checks.tableSessionId, tableSessionId), eq(schema.checks.status, 'open')))
      .limit(1);
    if (openCheck) return { error: 'check_open' };
  }

  const quantities = new Map<string, number>();
  for (const line of rawLines) {
    quantities.set(line.entryId, (quantities.get(line.entryId) ?? 0) + line.quantity);
  }
  const entryIds = [...quantities.keys()];

  const entries = await db
    .select({
      id: schema.menuEntries.id,
      name: schema.menuEntries.name,
      price: schema.menuEntries.price,
      hidden: schema.menuEntries.hidden,
      outOfStock: schema.menuEntries.outOfStock,
    })
    .from(schema.menuEntries)
    .where(inArray(schema.menuEntries.id, entryIds));
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const staleEntryIds = entryIds.filter((id) => {
    const entry = entryById.get(id);
    return !entry || entry.hidden || entry.outOfStock;
  });
  if (staleEntryIds.length > 0) return { error: 'stale_items', staleEntryIds };

  const destinationRows = await db
    .select({
      entryId: schema.entryDestinations.entryId,
      destinationId: schema.orderDestinations.id,
      destinationName: schema.orderDestinations.name,
    })
    .from(schema.entryDestinations)
    .innerJoin(schema.orderDestinations, eq(schema.entryDestinations.destinationId, schema.orderDestinations.id))
    .where(inArray(schema.entryDestinations.entryId, entryIds));
  const destinationsByEntry = new Map<string, { destinationId: string; destinationName: string }[]>();
  for (const row of destinationRows) {
    const list = destinationsByEntry.get(row.entryId) ?? [];
    list.push({ destinationId: row.destinationId, destinationName: row.destinationName });
    destinationsByEntry.set(row.entryId, list);
  }

  const orderId = crypto.randomUUID();
  const orderDay = currentOrderDay(new Date(), orderTimeZone);
  const itemValues = entryIds.map((entryId) => {
    const entry = entryById.get(entryId)!;
    return {
      id: crypto.randomUUID(),
      orderId,
      entryId,
      name: entry.name,
      price: entry.price,
      quantity: quantities.get(entryId)!,
    };
  });
  const itemDestinationValues = itemValues.flatMap((item) =>
    (destinationsByEntry.get(item.entryId) ?? []).map((dest) => ({
      id: crypto.randomUUID(),
      orderItemId: item.id,
      destinationId: dest.destinationId,
      destinationName: dest.destinationName,
    })),
  );

  for (let attempt = 0; attempt < MAX_NUMBERING_RETRIES; attempt++) {
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(schema.orders)
      .where(eq(schema.orders.orderDay, orderDay));
    const dailyNumber = existingCount + 1;

    try {
      await db.batch([
        db.insert(schema.orders).values({
          id: orderId,
          orderDay,
          dailyNumber,
          idempotencyKey,
          tableSessionId: tableSessionId ?? null,
        }),
        db.insert(schema.orderItems).values(itemValues),
        ...(itemDestinationValues.length > 0 ? [db.insert(schema.orderItemDestinations).values(itemDestinationValues)] : []),
        db.insert(schema.orderEvents).values({
          id: crypto.randomUUID(),
          orderId,
          status: 'submitted',
          actor,
          actorName: actorName ?? null,
        }),
      ]);
      return { ok: true, orderId, dailyNumber };
    } catch (error) {
      const won = await findByIdempotencyKey(db, idempotencyKey);
      if (won) return won;
      if (attempt === MAX_NUMBERING_RETRIES - 1) throw error;
    }
  }

  throw new Error('Could not assign order number');
}

async function findByIdempotencyKey(db: DbInstance, idempotencyKey: string) {
  const [row] = await db
    .select({ id: schema.orders.id, dailyNumber: schema.orders.dailyNumber })
    .from(schema.orders)
    .where(eq(schema.orders.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!row) return null;
  return { ok: true as const, orderId: row.id, dailyNumber: row.dailyNumber };
}
