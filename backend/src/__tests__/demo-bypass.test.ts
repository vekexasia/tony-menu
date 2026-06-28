import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, installJwksMock } from './helpers/db';
import { isDemoMode } from '../lib/demo';

beforeAll(() => installJwksMock());

/**
 * Pins the by-design demo-mode behavior: when DEMO_MODE === 'true' both
 * requireAuth and requireAdmin are bypassed. This is intentional (demo
 * deployments have no Cloudflare Access in front). These tests exist to make
 * any accidental change to that contract loud.
 *
 * Production safety: DEMO_MODE only activates on the exact string 'true'
 * (see isDemoMode). wrangler.toml ships DEMO_MODE = "false", and Env has no
 * default, so an unset/empty/any-other value leaves demo mode OFF.
 */
describe('demo mode auth bypass (by design)', () => {
  it('isDemoMode only treats the literal string "true" as enabled', () => {
    expect(isDemoMode({} as never)).toBe(false);
    expect(isDemoMode({ DEMO_MODE: 'false' } as never)).toBe(false);
    expect(isDemoMode({ DEMO_MODE: 'TRUE' } as never)).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1' } as never)).toBe(false);
    expect(isDemoMode({ DEMO_MODE: 'true' } as never)).toBe(true);
  });

  it('reaches admin routes without any Access JWT when demo mode is on', async () => {
    const db = createTestDb();
    seedSettings(db);
    const res = await testRequest('/admin/settings', {
      env: makeDbEnv(db, { DEMO_MODE: 'true' }),
    });
    expect(res.status).toBe(200);
  });

  it('still requires auth (401) when demo mode is off', async () => {
    const db = createTestDb();
    seedSettings(db);
    const res = await testRequest('/admin/settings', {
      env: makeDbEnv(db, { DEMO_MODE: 'false' }),
    });
    expect(res.status).toBe(401);
  });
});
