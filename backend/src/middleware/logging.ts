import { createMiddleware } from 'hono/factory';
import type { AppBindings } from '../types';
import { checkRateLimit } from '../lib/rate-limit';

/**
 * Request logging middleware.
 * Logs method, path, status, and response time.
 */
export const requestLogger = createMiddleware<AppBindings>(async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      method,
      path,
      status,
      duration_ms: duration,
      cf_ray: c.req.header('cf-ray'),
      ip: c.req.header('cf-connecting-ip'),
    }),
  );
});

/**
 * Per-IP rate limiter using Cloudflare's cf-connecting-ip.
 * Delegates to the shared sliding-window limiter in lib/rate-limit.
 * `scope` keeps each mount's budget separate — without it all mounts share
 * one per-IP counter and staff/customer traffic starves the admin budget.
 */
export function rateLimit(scope: string, maxRequests: number, windowMs: number) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (c.env?.E2E_MODE === 'true') {
      await next();
      return;
    }
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    const limited = checkRateLimit(`ip:${scope}:${ip}`, maxRequests, windowMs);
    if (limited) return limited;
    await next();
  });
}
