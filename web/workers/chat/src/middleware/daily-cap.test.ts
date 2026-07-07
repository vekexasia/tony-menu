import { describe, it, expect, beforeEach, vi } from 'vitest';
import { consumeDailyAiRequest } from './daily-cap';
import type { Env } from '../types';

function makeEnv(limit?: string): Env {
  const store = new Map<string, string>();
  return {
    DAILY_AI_REQUEST_LIMIT: limit,
    MENU_CACHE: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
      delete: vi.fn(async (key: string) => { store.delete(key); }),
    } as unknown as KVNamespace,
  } as unknown as Env;
}

beforeEach(() => vi.restoreAllMocks());

describe('daily AI request cap', () => {
  it('allows requests when no limit is configured', async () => {
    const env = makeEnv();
    await expect(consumeDailyAiRequest(env)).resolves.toEqual({ allowed: true, limit: null, used: 0 });
  });

  it('allows exactly the configured number of requests per UTC day', async () => {
    const env = makeEnv('2');
    const now = new Date('2026-04-30T12:00:00Z');

    await expect(consumeDailyAiRequest(env, now)).resolves.toMatchObject({ allowed: true, limit: 2, used: 1 });
    await expect(consumeDailyAiRequest(env, now)).resolves.toMatchObject({ allowed: true, limit: 2, used: 2 });
    await expect(consumeDailyAiRequest(env, now)).resolves.toMatchObject({ allowed: false, limit: 2, used: 2 });
  });

  it('uses a UTC date bucket', async () => {
    const env = makeEnv('1');

    await expect(consumeDailyAiRequest(env, new Date('2026-04-30T23:59:00Z'))).resolves.toMatchObject({ allowed: true });
    await expect(consumeDailyAiRequest(env, new Date('2026-04-30T23:59:30Z'))).resolves.toMatchObject({ allowed: false });
    await expect(consumeDailyAiRequest(env, new Date('2026-05-01T00:00:01Z'))).resolves.toMatchObject({ allowed: true });
  });
});
