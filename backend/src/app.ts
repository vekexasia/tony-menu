import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getRuntimeConfig } from './lib/env';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { catalogRoutes } from './routes/catalog';
import { orderRoutes } from './routes/orders';
import { staffRoutes } from './routes/staff';
import { adminRoutes } from './routes/admin';
import { requestLogger, rateLimit } from './middleware/logging';
import type { AppBindings } from './types';

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004'];

export function createApp() {
  const app = new Hono<AppBindings>();

  // CORS for frontend origins.
  // ALLOWED_ORIGINS:       comma-separated explicit origins.
  // ALLOWED_HOST_SUFFIXES: comma-separated hostname suffixes allowed over HTTPS
  //                        (e.g. ".your-pages-project.pages.dev" to permit all preview deploys).
  app.use('*', async (c, next) => {
    const explicit = c.env.ALLOWED_ORIGINS
      ? c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const suffixes = c.env.ALLOWED_HOST_SUFFIXES
      ? c.env.ALLOWED_HOST_SUFFIXES.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const origins = [...DEFAULT_ORIGINS, ...explicit];
    return cors({
      origin: (origin) => {
        if (!origin) return null;
        if (origins.includes(origin)) return origin;
        if (suffixes.length > 0) {
          try {
            const url = new URL(origin);
            if (url.protocol === 'https:' && suffixes.some((s) => url.hostname.endsWith(s))) {
              return origin;
            }
          } catch {
            // fall through to deny
          }
        }
        return null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Cf-Access-Jwt-Assertion', 'X-Staff-Session'],
      // Required so the browser sends cookies / Access JWT on cross-origin
      // /admin/* calls (frontend on Pages, backend on workers.dev).
      credentials: true,
      maxAge: 86400,
    })(c, next);
  });

  // Request logging
  app.use('*', requestLogger);

  // Rate limiting: public write endpoints only. /admin/* is behind Cloudflare
  // Access and /staff/* requires a session token (token consumption has its own
  // limiter in routes/staff.ts), so neither needs a blanket per-IP limit — one
  // shared venue IP was exhausting the budget and 429ing the admin UI.
  // Scopes keep each mount's budget separate: without them /catalog/view
  // traffic would fill the shared per-IP counter and block order submits.
  // Stricter limit for view tracking — 60 req/min per IP.
  // Primary DoS protection; DB UNIQUE constraint catches any that slip through.
  app.use('/catalog/view', rateLimit('view', 60, 60_000));
  // Public order submit — 10 req/min per IP; idempotency key dedupes retries.
  app.use('/orders', rateLimit('orders', 10, 60_000));
  // Waiter-handoff intent creation (#19) — same budget, separate mount because
  // Hono's '/orders' middleware does not match subpaths.
  app.use('/orders/intents', rateLimit('orders', 10, 60_000));

  // Runtime config parsing
  app.use('*', async (c, next) => {
    const config = getRuntimeConfig(c.env);
    c.set('config', config);
    await next();
  });

  app.get('/', (c) => {
    const config = c.get('config');

    return c.json({
      service: config.serviceName,
      message: 'Cloudflare backend scaffold is live.',
      docs: {
        adr: 'docs/adr/0001-cloudflare-backend-platform.md',
        workspace: 'backend/README.md',
      },
      safeMode: true,
    });
  });

  app.route('/', healthRoutes);
  app.route('/admin/me', meRoutes);
  app.route('/catalog', catalogRoutes);
  app.route('/orders', orderRoutes);
  app.route('/staff', staffRoutes);
  app.route('/admin', adminRoutes);

  app.notFound((c) => c.json({ error: 'Not Found' }, 404));

  app.onError((error, c) => {
    console.error('backend-error', error);
    return c.json(
      {
        error: 'Internal Server Error',
        message:
          c.env.APP_ENV === 'development'
            ? error.message
            : 'Unexpected backend failure',
      },
      500,
    );
  });

  return app;
}
