import { Hono } from 'hono';
import type { AppBindings } from '../types';

export const healthRoutes = new Hono<AppBindings>()
  .get('/health', (c) => {
    const config = c.get('config');

    return c.json({
      status: 'ok',
      service: config.serviceName,
      environment: config.appEnv,
      apiVersion: config.apiVersion,
      commitSha: config.commitSha,
      databaseMode: config.databaseMode,
      hasPublicMenuBucket: config.hasPublicMenuBucket,
      authConfigured: config.auth.configured,
      safeMode: 'no-production-cutover',
      timestamp: new Date().toISOString(),
    });
  })
  .get('/ready', (c) => {
    const config = c.get('config');
    const ready = config.databaseMode !== 'unconfigured';

    return c.json(
      {
        ready,
        databaseMode: config.databaseMode,
        checks: {
          databaseConfigured: ready,
          publicMenuBucketConfigured: config.hasPublicMenuBucket,
          authConfigured: config.auth.configured,
        },
      },
      ready ? 200 : 503,
    );
  });
