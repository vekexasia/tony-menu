import type { AuthUser } from './middleware/auth';
import type { createDb } from './db/index';

export interface Env {
  APP_ENV?: string;
  API_VERSION?: string;
  SERVICE_NAME?: string;
  COMMIT_SHA?: string;
  ALLOWED_ORIGINS?: string;
  ALLOWED_HOST_SUFFIXES?: string;
  DB?: D1Database;
  PUBLIC_MENU_BUCKET?: R2Bucket;
  R2_PUBLIC_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAILS?: string;
  OPENAI_API_KEY?: string;
  BASE_DOMAIN?: string;
  DEMO_MODE?: string;
}

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  apiVersion: string;
  serviceName: string;
  commitSha: string;
  databaseMode: 'd1' | 'unconfigured';
  hasPublicMenuBucket: boolean;
  auth: {
    issuer?: string;
    audience?: string;
    configured: boolean;
  };
}

/** Variables set by middleware, available via c.get() */
export interface AppVariables {
  config: RuntimeConfig;
  user: AuthUser;
  db: NonNullable<ReturnType<typeof createDb>>;
}

/** Standard Hono app bindings for typed route handlers */
export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};
