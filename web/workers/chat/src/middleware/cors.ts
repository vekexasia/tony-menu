import type { D1DatabaseLike } from '../types';

const DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

type CorsEnv = {
  DB?: D1DatabaseLike;
  ALLOWED_ORIGINS?: string;
  ALLOWED_HOST_SUFFIXES?: string;
};

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseOrigin(origin: string | null): URL | null {
  if (!origin) return null;
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function isStandardAllowedOrigin(origin: string, parsed: URL, env: CorsEnv): boolean {
  const explicit = [...DEV_ALLOWED_ORIGINS, ...splitCsv(env.ALLOWED_ORIGINS)];
  if (explicit.includes(origin)) return true;
  if (parsed.protocol !== 'https:') return false;
  const suffixes = splitCsv(env.ALLOWED_HOST_SUFFIXES);
  return suffixes.some((suffix) => parsed.hostname.endsWith(suffix));
}

/**
 * Custom restaurant domains are trusted only after verification in D1.
 * Querying by hostname keeps CORS in sync with the same association used by
 * /catalog/resolve-domain, and avoids hard-coding every tenant domain here.
 */
async function isVerifiedRestaurantDomain(db: D1DatabaseLike | undefined, hostname: string): Promise<boolean> {
  if (!db) return false;
  const row = await db
    .prepare('SELECT restaurant_id FROM restaurant_domains WHERE domain = ? AND verified = 1 LIMIT 1')
    .bind(hostname)
    .first<{ restaurant_id: string }>();
  return !!row;
}

async function isAllowedOrigin(origin: string | null, env: CorsEnv): Promise<boolean> {
  const parsed = parseOrigin(origin);
  if (!origin || !parsed) return false;
  if (isStandardAllowedOrigin(origin, parsed, env)) return true;
  if (parsed.protocol !== 'https:') return false;
  return isVerifiedRestaurantDomain(env.DB, parsed.hostname);
}

export async function getCorsHeaders(request: Request, env: CorsEnv): Promise<Record<string, string>> {
  const origin = request.headers.get('Origin');
  if (!(await isAllowedOrigin(origin, env))) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export async function handleCorsPreFlight(request: Request, env: CorsEnv): Promise<Response | null> {
  if (request.method !== 'OPTIONS') return null;
  const headers = await getCorsHeaders(request, env);
  if (!headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers });
}
