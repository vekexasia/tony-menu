import { createMiddleware } from 'hono/factory';
import type { Env, RuntimeConfig } from '../types';
import type { createDb } from '../db/index';
import type { StaffSession } from '../lib/staff';
import { STAFF_SESSION_HEADER, validateStaffSession } from '../lib/staff';
import { isDemoMode } from '../lib/demo';

type StaffBindings = {
  Bindings: Env;
  Variables: {
    config: RuntimeConfig;
    db: NonNullable<ReturnType<typeof createDb>>;
    staff: StaffSession;
  };
};

/**
 * Staff session middleware (#15): validates the X-Staff-Session token against a
 * consumed, non-revoked staff link. Must run AFTER requireDb. Demo mode passes
 * with a synthetic session so the demo deployment's waiter mode works.
 */
export const requireStaff = createMiddleware<StaffBindings>(async (c, next) => {
  if (isDemoMode(c.env)) {
    c.set('staff', { linkId: 'demo-staff', name: 'Demo Staff' });
    await next();
    return;
  }

  const token = c.req.header(STAFF_SESSION_HEADER);
  const session = await validateStaffSession(c.get('db'), token);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  c.set('staff', session);
  await next();
});
