import { eq } from 'drizzle-orm';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@menu/schemas';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

export async function transitionOrderStatus(
  db: DbInstance,
  orderId: string,
  status: 'ready' | 'served' | 'rejected',
  actor: 'admin' | 'staff',
  actorName: string | null = null,
  rejectReason?: string,
) {
  const [order] = await db
    .select({ status: schema.orders.status })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (!order) return { error: 'not_found' as const };

  const allowed = ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(status)) {
    return { error: 'illegal_transition' as const, from: order.status, to: status };
  }

  await db.batch([
    db
      .update(schema.orders)
      .set({
        status,
        rejectReason: status === 'rejected' ? rejectReason : null,
        updatedAt: Date.now(),
      })
      .where(eq(schema.orders.id, orderId)),
    db.insert(schema.orderEvents).values({
      id: crypto.randomUUID(),
      orderId,
      status,
      actor,
      actorName,
    }),
  ]);
  return { ok: true as const, status };
}
