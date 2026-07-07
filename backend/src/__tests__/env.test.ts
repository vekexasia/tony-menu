/**
 * Runtime config and environment parsing tests.
 */
import { describe, it, expect } from 'vitest';
import { getRuntimeConfig } from '../lib/env';
import type { Env } from '../types';

describe('getRuntimeConfig', () => {
  it('uses development defaults when env is empty', () => {
    const config = getRuntimeConfig({} as Env);
    expect(config.appEnv).toBe('development');
    expect(config.apiVersion).toBe('v1');
    expect(config.databaseMode).toBe('unconfigured');
    expect(config.auth.configured).toBe(false);
  });

  it('detects d1 mode when DB binding is present', () => {
    const config = getRuntimeConfig({
      DB: {} as D1Database,
    } as Env);
    expect(config.databaseMode).toBe('d1');
  });

  it('marks auth as configured when both issuer and audience are set', () => {
    const config = getRuntimeConfig({
      ACCESS_TEAM_DOMAIN: 'https://securetoken.google.com/my-project',
      ACCESS_AUD: 'my-project',
    } as Env);
    expect(config.auth.configured).toBe(true);
    expect(config.auth.issuer).toBe('https://securetoken.google.com/my-project');
    expect(config.auth.audience).toBe('my-project');
  });

  it('marks auth as NOT configured when only issuer is set', () => {
    const config = getRuntimeConfig({
      ACCESS_TEAM_DOMAIN: 'https://securetoken.google.com/my-project',
    } as Env);
    expect(config.auth.configured).toBe(false);
  });

  it('marks auth as NOT configured when only audience is set', () => {
    const config = getRuntimeConfig({
      ACCESS_AUD: 'my-project',
    } as Env);
    expect(config.auth.configured).toBe(false);
  });

  it('reads ORDER_TIME_ZONE', () => {
    const config = getRuntimeConfig({ ORDER_TIME_ZONE: 'Europe/Rome' } as Env);
    expect(config.orderTimeZone).toBe('Europe/Rome');
  });

  it('throws on invalid APP_ENV value', () => {
    expect(() =>
      getRuntimeConfig({ APP_ENV: 'invalid' as 'development' } as Env),
    ).toThrow();
  });

  it('reports hasPublicMenuBucket false when R2 not bound', () => {
    const config = getRuntimeConfig({} as Env);
    expect(config.hasPublicMenuBucket).toBe(false);
  });
});
