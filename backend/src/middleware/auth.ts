import { createMiddleware } from 'hono/factory';
import type { Env, RuntimeConfig } from '../types';
import { isDemoMode } from '../lib/demo';

export interface AuthUser {
  /** Stable identifier for the authenticated user — for Cloudflare Access this is the email. */
  uid: string;
  email: string;
  name?: string;
  claims: Record<string, unknown>;
}

type AuthBindings = {
  Bindings: Env;
  Variables: {
    config: RuntimeConfig;
    user: AuthUser;
  };
};

/**
 * JWKS cache: fetched once per worker instance, refreshed if verification fails.
 */
let jwksCache: Map<string, CryptoKey> = new Map();
let jwksCacheIssuer: string | null = null;

async function fetchJwks(issuer: string): Promise<Map<string, CryptoKey>> {
  // Cloudflare Access serves its public keys at /cdn-cgi/access/certs.
  const certsUrl = issuer.replace(/\/$/, '') + '/cdn-cgi/access/certs';

  const resp = await fetch(certsUrl);
  if (!resp.ok) {
    throw new Error(`Failed to fetch JWKS from ${certsUrl}: ${resp.status}`);
  }

  const jwks = (await resp.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();

  for (const jwk of jwks.keys) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(jwk.kid, key);
  }

  return keys;
}

async function getSigningKey(issuer: string, kid: string): Promise<CryptoKey> {
  if (jwksCacheIssuer === issuer && jwksCache.has(kid)) {
    return jwksCache.get(kid)!;
  }

  jwksCache = await fetchJwks(issuer);
  jwksCacheIssuer = issuer;

  const key = jwksCache.get(kid);
  if (!key) {
    throw new Error(`No signing key found for kid: ${kid}`);
  }
  return key;
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
}

async function verifyJwt(
  token: string,
  issuer: string,
  audience: string,
): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header: JwtHeader = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }
  if (!header.kid) {
    throw new Error('JWT missing kid header');
  }

  const signingKey = await getSigningKey(issuer, header.kid);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', signingKey, signature, data);
  if (!valid) {
    throw new Error('Invalid JWT signature');
  }

  const payload: JwtPayload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  if (!payload.email) {
    throw new Error('JWT missing email claim');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp) {
    throw new Error('JWT missing exp claim');
  }
  if (payload.exp < now) {
    throw new Error('JWT expired');
  }

  if (payload.nbf && payload.nbf > now) {
    throw new Error('JWT not yet valid (nbf)');
  }

  if (payload.iss !== issuer) {
    throw new Error(`Invalid issuer: ${payload.iss}`);
  }

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) {
    throw new Error(`Invalid audience: ${payload.aud}`);
  }

  return payload;
}

/**
 * Auth middleware: Cloudflare Access in Workers, trusted proxy header in self-host.
 *
 * Self-host deployments must block direct backend access. Otherwise clients can spoof
 * the trusted email header.
 */
export const requireAuth = createMiddleware<AuthBindings>(async (c, next) => {
  const config = c.get('config');

  if (isDemoMode(c.env)) {
    c.set('user', {
      uid: 'demo-admin@risto.menu',
      email: 'demo-admin@risto.menu',
      name: 'Demo Admin',
      claims: { demo: true },
    });
    await next();
    return;
  }

  if (!config.auth.configured) {
    return c.json({ error: 'Auth not configured on this backend instance' }, 503);
  }

  if (config.auth.mode === 'trusted-header') {
    const headerName = config.auth.trustedHeader || 'x-forwarded-email';
    const email = c.req.header(headerName);
    if (!email) return c.json({ error: `Missing ${headerName} header` }, 401);
    c.set('user', {
      uid: email,
      email,
      name: c.req.header('x-forwarded-name') || undefined,
      claims: { trustedHeader: headerName },
    });
    await next();
    return;
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion');
  if (!token) {
    return c.json({ error: 'Missing Cf-Access-Jwt-Assertion header' }, 401);
  }

  try {
    const payload = await verifyJwt(token, config.auth.issuer!, config.auth.audience!);

    const email = payload.email as string;
    const user: AuthUser = {
      uid: email,
      email,
      name: payload.name as string | undefined,
      claims: payload,
    };
    c.set('user', user);
    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return c.json({ error: 'Unauthorized', message }, 401);
  }
});
