import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

/** Header the waiter device sends its session token in (#15). */
export const STAFF_SESSION_HEADER = 'X-Staff-Session';

/** lastSeenAt is only rewritten when this stale — a cheap heartbeat, not a log. */
const LAST_SEEN_THROTTLE_MS = 60_000;

export interface StaffSession {
  linkId: string;
  name: string;
}

/**
 * Validate a staff session token: the link must be consumed, its sessionToken
 * must match, and it must not be revoked. Bumps lastSeenAt (throttled). Returns
 * null for any invalid/revoked token.
 */
export async function validateStaffSession(
  db: DbInstance,
  sessionToken: string | undefined | null,
): Promise<StaffSession | null> {
  if (!sessionToken) return null;

  const [link] = await db
    .select({
      id: schema.staffLinks.id,
      name: schema.staffLinks.name,
      revokedAt: schema.staffLinks.revokedAt,
      lastSeenAt: schema.staffLinks.lastSeenAt,
    })
    .from(schema.staffLinks)
    .where(eq(schema.staffLinks.sessionToken, sessionToken))
    .limit(1);

  if (!link || link.revokedAt !== null) return null;

  const now = Date.now();
  if (link.lastSeenAt === null || now - link.lastSeenAt > LAST_SEEN_THROTTLE_MS) {
    await db
      .update(schema.staffLinks)
      .set({ lastSeenAt: now })
      .where(eq(schema.staffLinks.id, link.id));
  }

  return { linkId: link.id, name: link.name };
}
