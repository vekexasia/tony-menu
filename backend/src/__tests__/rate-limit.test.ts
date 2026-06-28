import { describe, it, expect, afterEach, vi } from 'vitest';
import { checkRateLimit } from '../lib/rate-limit';
import { rateLimit } from '../middleware/logging';
import { Hono } from 'hono';

afterEach(() => vi.useRealTimers());

// Both limiters are per-isolate in-memory (see ponytail notes in their sources).
// Tests use unique keys/IPs and fake timers so module-level state stays isolated.

describe('checkRateLimit (lib/rate-limit)', () => {
  it('allows up to maxRequests then returns 429', () => {
    const key = `t-${Math.floor(Date.now())}-a`;
    expect(checkRateLimit(key, 2, 60_000)).toBeNull();
    expect(checkRateLimit(key, 2, 60_000)).toBeNull();
    const limited = checkRateLimit(key, 2, 60_000);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
  });

  it('resets after the sliding window elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const key = 'sliding-key';
    expect(checkRateLimit(key, 1, 1000)).toBeNull();
    expect(checkRateLimit(key, 1, 1000)).not.toBeNull();
    // Advance past the window — old timestamp falls out, request allowed again.
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    expect(checkRateLimit(key, 1, 1000)).toBeNull();
  });
});

describe('rateLimit middleware (middleware/logging)', () => {
  function appWith(max: number, windowMs: number) {
    const app = new Hono();
    app.use('*', rateLimit(max, windowMs));
    app.get('/', (c) => c.text('ok'));
    return app;
  }

  function req(ip: string) {
    return new Request('https://test.local/', { headers: { 'cf-connecting-ip': ip } });
  }

  it('returns 429 once the per-window count is exceeded', async () => {
    const app = appWith(2, 60_000);
    const ip = 'mw-ip-1';
    expect((await app.fetch(req(ip))).status).toBe(200);
    expect((await app.fetch(req(ip))).status).toBe(200);
    expect((await app.fetch(req(ip))).status).toBe(429);
  });

  it('resets the count after resetAt passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    const app = appWith(1, 1000);
    const ip = 'mw-ip-2';
    expect((await app.fetch(req(ip))).status).toBe(200);
    expect((await app.fetch(req(ip))).status).toBe(429);
    vi.setSystemTime(new Date('2026-02-01T00:00:02Z'));
    expect((await app.fetch(req(ip))).status).toBe(200);
  });
});
