import { Hono } from 'hono';
import { eq, inArray, count } from 'drizzle-orm';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import { SubmitOrderBodySchema, normalizeModulesConfig } from '@menu/schemas';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';
import type { AppBindings } from '../types';

/** YYYYMMDD integer bucket (UTC) — same pattern as catalogViews.dateBucket. */
export function currentOrderDay(now = new Date()): number {
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

const MAX_NUMBERING_RETRIES = 3;

export const orderRoutes = new Hono<AppBindings>()
  /**
   * POST /orders
   *
   * Public direct-submit endpoint (submitMode diner|both). Validates every
   * line against hidden/outOfStock/deleted entries and rejects listing the
   * stale ids — never silently drops. Idempotent via a client key; daily
   * numbering is COUNT(*)+1 with retry-on-conflict. Rate limited in app.ts.
   */
  .post('/', requireDb, async (c) => {
    const db = c.get('db');

    const body = await parseBody(c, SubmitOrderBodySchema);
    if (body instanceof Response) return body;

    // Module gating: ordering must be on and allow diner submits.
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
    // Direct submit needs: module on, mode 'send' (legacy 'summary' configs stay
    // summary-only), and a submitMode that lets the diner send ('diner'|'both').
    const ordering = normalizeModulesConfig(settingsRow?.modules, settingsRow).ordering;
    if (
      !settingsRow
      || settingsRow.publicationState !== 'published'
      || !ordering.enabled
      || ordering.mode !== 'send'
      || ordering.submitMode === 'waiter'
    ) {
      return c.json({ error: 'Not Found' }, 404);
    }

    // Idempotency: a retried submit returns the already-created order.
    const existing = await findByIdempotencyKey(db, body.idempotencyKey);
    if (existing) return c.json(existing);

    // Merge duplicate entryIds so one entry can't create two lines.
    const quantities = new Map<string, number>();
    for (const line of body.lines) {
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
      return c.json({ error: 'stale_items', staleEntryIds }, 409);
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
            idempotencyKey: body.idempotencyKey,
          }),
          db.insert(schema.orderItems).values(itemValues),
          ...(itemDestinationValues.length > 0
            ? [db.insert(schema.orderItemDestinations).values(itemDestinationValues)]
            : []),
        ]);
        return c.json({ ok: true, orderId, dailyNumber });
      } catch (error) {
        // A concurrent request with the same idempotency key won the race.
        const won = await findByIdempotencyKey(db, body.idempotencyKey);
        if (won) return c.json(won);
        // Otherwise assume daily-number collision and retry with a fresh count.
        if (attempt === MAX_NUMBERING_RETRIES - 1) throw error;
      }
    }

    return c.json({ error: 'Could not assign order number' }, 500);
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
