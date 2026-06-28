import { createApp } from '../app';
import type { Env } from '../types';

const DEFAULT_ENV: Env = {
  APP_ENV: 'development',
  API_VERSION: 'v1',
  SERVICE_NAME: 'risto-test',
  ACCESS_TEAM_DOMAIN: 'https://auth.example.com',
  ACCESS_AUD: 'risto-test',
};

interface TestRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  env?: Partial<Env>;
}

/**
 * Returns a complete Env merged with the defaults. Tests pass overrides to
 * inject D1, ADMIN_EMAILS, etc.
 */
export function makeEnv(overrides: Partial<Env> = {}): Env {
  return { ...DEFAULT_ENV, ...overrides };
}

/**
 * Build and dispatch a request against a fresh Hono app instance with the
 * provided env overlay.
 */
export async function testRequest(path: string, options: TestRequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, headers = {}, env = {} } = options;

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      init.body = body as BodyInit;
    } else {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json', ...headers };
    }
  }

  const app = createApp();
  const url = `https://test.local${path}`;
  const mergedEnv = makeEnv(env);
  return app.fetch(new Request(url, init), mergedEnv);
}
