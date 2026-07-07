import { Hono } from 'hono';
import { SubmitOrderBodySchema, CreateOrderIntentBodySchema } from '@menu/schemas';
import { requireDb } from '../middleware/db';
import { parseBody } from '../lib/validate';
import { STAFF_SESSION_HEADER, validateStaffSession } from '../lib/staff';
import { createOrder, INTENT_TTL_MS, loadOrdering } from '../orders';
import * as schema from '../db/schema';
import type { AppBindings } from '../types';

export { currentOrderDay, INTENT_TTL_MS } from '../orders';

export const orderRoutes = new Hono<AppBindings>()
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
      const session = await validateStaffSession(db, c.req.header(STAFF_SESSION_HEADER));
      if (!session) return c.json({ error: 'Unauthorized' }, 401);
      staffName = session.name;
    } else if (ordering.submitMode === 'waiter') {
      return c.json({ error: 'Not Found' }, 404);
    }

    const result = await createOrder(
      db,
      body.idempotencyKey,
      body.lines,
      body.tableSessionId,
      body.tableSessionId ? 'staff' : 'diner',
      staffName,
      c.get('config').orderTimeZone,
    );
    if ('error' in result) return c.json(result, 409);
    return c.json(result);
  })
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
    await db.insert(schema.orderIntents).values({ id: token, lines: body.lines, expiresAt });
    return c.json({ ok: true, token, expiresAt });
  });
