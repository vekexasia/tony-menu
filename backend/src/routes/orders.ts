import { Hono } from 'hono';
import { eq, and, inArray, isNull, count } from 'drizzle-orm';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import { SubmitOrderBodySchema, CreateOrderIntentBodySchema, normalizeModulesConfig } from '@menu/schemas';
import * as schema from '../db/schema';
import { STAFF_SESSION_HEADER, validateStaffSession } from '../lib/staff';
import type { DbInstance } from '../db';
import type { AppBindings } from '../types';

/** YYYYMMDD integer bucket (UTC) — same pattern as catalogViews.dateBucket. */
export function currentOrderDay(now = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

/** Intents expire 30 minutes after creation (#19). */
export const INTENT_TTL_MS = 30 * 60_000;

const MAX_NUMBERING_RETRIES = 3;

export type CreateOrderResult =
  | { ok: true; orderId: string; dailyNumber: number }
  | { error: 'stale_items'; staleEntryIds: string[] }
  | { error: 'invalid_table_session' }
  | { error: 'check_open' };

/**
 * The single order-creation path (issue #17). Both the public direct submit
 * and the waiter intent-consume (#19) go through here: idempotency, duplicate
 * line merging, stale-item validation, frozen name/price snapshot, destination
 * snapshot, and daily numbering with retry-on-conflict.
 */
export async function createOrder(
  db: DbInstance,
  idempotencyKey: string,
  rawLines: { entryId: string; quantity: number }[],
  tableSessionId?: string | null,
  actor: 'diner' | 'staff' = tableSessionId ? 'staff' : 'diner',
  actorName?: string | null,
): Promise<CreateOrderResult> {
  // Idempotency first: a retried submit returns the already-created order even
  // if the table session has since closed (no false invalid_table_session).
  const existing = await findByIdempotencyKey(db, idempotencyKey);
  if (existing) return existing;

  // Guard the optional table session (#15): it must exist and be open, so an
  // invalid id can't 500 on the FK and a closed session can't accept appends.
  if (tableSessionId != null) {
    const [session] = await db
      .select({ id: schema.tableSessions.id })
      .from(schema.tableSessions)
      .where(and(eq(schema.tableSessions.id, tableSessionId), isNull(schema.tableSessions.closedAt)))
      .limit(1);
    if (!session) return { error: 'invalid_table_session' };

    // An open check freezes the session: no new orders while it awaits settle/void (#15).
    const [openCheck] = await db
      .select({ id: schema.checks.id })
      .from(schema.checks)
      .where(and(eq(schema.checks.tableSessionId, tableSessionId), eq(schema.checks.status, 'open')))
      .limit(1);
    if (openCheck) return { error: 'check_open' };
  }

  // Merge duplicate entryIds so one entry can't create two lines.
  const quantities = new Map<string, number>();
  for (const line of rawLines) {
    quantities.set(line.entryId, (quantities.get(line.entryId) ?? 0) + line.quantity);
  }
  const entryIds = [...quantities.keys()];

  // Stale-item validation: hidden, out-of-stock, or deleted entries block the
  // whole order — the diner must remove them to send.
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
  if (staleEntryIds.length > 0) {
    return { error: 'stale_items', staleEntryIds };
  }

  // Destination snapshot: resolve each entry's destinations now so routing
  // survives later menu/destination edits.
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
  const orderDay = currentOrderDay();

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

  // Daily numbering: COUNT(*)+1, retried when a concurrent submit takes the
  // same number (UNIQUE(order_day, daily_number) rejects the batch).
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
        ...(itemDestinationValues.length > 0
          ? [db.insert(schema.orderItemDestinations).values(itemDestinationValues)]
          : []),
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
      // A concurrent request with the same idempotency key won the race.
      const won = await findByIdempotencyKey(db, idempotencyKey);
      if (won) return won;
      // Otherwise assume daily-number collision and retry with a fresh count.
      if (attempt === MAX_NUMBERING_RETRIES - 1) throw error;
    }
  }

  throw new Error('Could not assign order number');
}

/** Loads the normalized ordering config; null when unpublished or missing. */
async function loadOrdering(db: DbInstance) {
  const [settingsRow] = await db
    .select({
      modules: schema.settings.modules,
      aiChatEnabled: schema.settings.aiChatEnabled,
      aiVoiceEnabled: schema.settings.aiVoiceEnabled,
      publicationState: schema.settings.publicationState,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  if (!settingsRow || settingsRow.publicationState !== 'published') return null;
  return normalizeModulesConfig(settingsRow.modules, settingsRow).ordering;
}

export const orderRoutes = new Hono<AppBindings>()
  /**
   * POST /orders
   *
   * Direct-submit endpoint. Rate limited in app.ts. Order creation lives in
   * createOrder(), shared with the waiter intent-consume path (#19).
   *
   * Two callers, one path (no duplicate submit route per #15):
   *  - diner self-submit: requires submitMode diner|both;
   *  - waiter table order (#15): body carries tableSessionId + a valid
   *    X-Staff-Session header, which bypasses the diner submitMode gate so
   *    waiter-only configs can still take table orders. The module must still
   *    be enabled and in 'send' mode.
   */
  .post('/', requireDb, async (c) => {
    const db = c.get('db');

    const body = await parseBody(c, SubmitOrderBodySchema);
    if (body instanceof Response) return body;

    const ordering = await loadOrdering(db);
    if (!ordering || !ordering.enabled || ordering.mode !== 'send') {
      return c.json({ error: 'Not Found' }, 404);
    }

    let staffName: string | null = null;
    if (body.tableSessionId != null) {
      // Waiter table order: authenticate the staff session instead of the
      // diner submitMode gate.
      const session = await validateStaffSession(db, c.req.header(STAFF_SESSION_HEADER));
      if (!session) return c.json({ error: 'Unauthorized' }, 401);
      staffName = session.name;
    } else if (ordering.submitMode === 'waiter') {
      // Diner self-submit is disabled in waiter-only mode.
      return c.json({ error: 'Not Found' }, 404);
    }

    const result = await createOrder(db, body.idempotencyKey, body.lines, body.tableSessionId, body.tableSessionId ? 'staff' : 'diner', staffName);
    if ('error' in result) return c.json(result, 409);
    return c.json(result);
  })
  /**
   * POST /orders/intents
   *
   * Public intent creation (submitMode waiter|both): stores a minimal
   * {entryId, quantity} snapshot and returns an opaque token the diner shows
   * as a QR. Name/price/availability are resolved at review/consume time so
   * the waiter always sees current data. Rate limited in app.ts.
   */
  .post('/intents', requireDb, async (c) => {
    const db = c.get('db');

    const body = await parseBody(c, CreateOrderIntentBodySchema);
    if (body instanceof Response) return body;

    const ordering = await loadOrdering(db);
    if (!ordering || !ordering.enabled || ordering.mode !== 'send' || ordering.submitMode === 'diner') {
      return c.json({ error: 'Not Found' }, 404);
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + INTENT_TTL_MS;
    await db.insert(schema.orderIntents).values({
      id: token,
      lines: body.lines,
      expiresAt,
    });
    return c.json({ ok: true, token, expiresAt });
  });

async function findByIdempotencyKey(db: DbInstance, idempotencyKey: string) {
  const [row] = await db
    .select({ id: schema.orders.id, dailyNumber: schema.orders.dailyNumber })
    .from(schema.orders)
    .where(eq(schema.orders.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!row) return null;
  return { ok: true as const, orderId: row.id, dailyNumber: row.dailyNumber };
}
