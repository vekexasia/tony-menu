import { z } from 'zod';
import type { Env, RuntimeConfig } from '../types';

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_VERSION: z.string().min(1).default('v1'),
  SERVICE_NAME: z.string().min(1).default('menu-backend'),
  COMMIT_SHA: z.string().min(1).default('dev'),
  ORDER_TIME_ZONE: z.string().min(1).default('UTC').refine(isTimeZone, 'Invalid time zone'),
  ACCESS_TEAM_DOMAIN: z.string().min(1).optional(),
  ACCESS_AUD: z.string().min(1).optional(),
  SELF_HOST_AUTH_HEADER: z.string().min(1).optional(),
});

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getRuntimeConfig(env: Env): RuntimeConfig {
  const parsed = envSchema.parse(env);

  return {
    appEnv: parsed.APP_ENV,
    apiVersion: parsed.API_VERSION,
    serviceName: parsed.SERVICE_NAME,
    commitSha: parsed.COMMIT_SHA,
    orderTimeZone: parsed.ORDER_TIME_ZONE,
    databaseMode: env.DB ? 'd1' : 'unconfigured',
    hasPublicMenuBucket: Boolean(env.PUBLIC_MENU_BUCKET),
    auth: {
      issuer: parsed.ACCESS_TEAM_DOMAIN,
      audience: parsed.ACCESS_AUD,
      trustedHeader: parsed.SELF_HOST_AUTH_HEADER,
      mode: parsed.ACCESS_TEAM_DOMAIN && parsed.ACCESS_AUD
        ? 'cloudflare-access'
        : parsed.SELF_HOST_AUTH_HEADER
          ? 'trusted-header'
          : 'unconfigured',
      configured: Boolean((parsed.ACCESS_TEAM_DOMAIN && parsed.ACCESS_AUD) || parsed.SELF_HOST_AUTH_HEADER),
    },
  };
}
