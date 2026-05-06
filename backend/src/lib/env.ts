import { z } from 'zod';
import type { Env, RuntimeConfig } from '../types';

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_VERSION: z.string().min(1).default('v1'),
  SERVICE_NAME: z.string().min(1).default('menu-backend'),
  COMMIT_SHA: z.string().min(1).default('dev'),
  ACCESS_TEAM_DOMAIN: z.string().min(1).optional(),
  ACCESS_AUD: z.string().min(1).optional(),
});

export function getRuntimeConfig(env: Env): RuntimeConfig {
  const parsed = envSchema.parse(env);

  return {
    appEnv: parsed.APP_ENV,
    apiVersion: parsed.API_VERSION,
    serviceName: parsed.SERVICE_NAME,
    commitSha: parsed.COMMIT_SHA,
    databaseMode: env.DB ? 'd1' : 'unconfigured',
    hasPublicMenuBucket: Boolean(env.PUBLIC_MENU_BUCKET),
    auth: {
      issuer: parsed.ACCESS_TEAM_DOMAIN,
      audience: parsed.ACCESS_AUD,
      configured: Boolean(parsed.ACCESS_TEAM_DOMAIN && parsed.ACCESS_AUD),
    },
  };
}
