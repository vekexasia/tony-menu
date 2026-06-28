import { describe, it, expect, beforeAll } from 'vitest';
import { testRequest } from './helpers';
import {
  createTestDb,
  makeDbEnv,
  signTestJwt,
  signTestJwtRaw,
  installJwksMock,
  TEST_JWT_ISSUER,
  TEST_JWT_AUDIENCE,
  TEST_JWT_KID,
} from './helpers/db';

beforeAll(() => installJwksMock());

/**
 * Exercises the real verifyJwt crypto path through requireAuth on the
 * auth-only /admin/me route. The JWKS fetch is intercepted (installJwksMock)
 * so the actual signature verification, claim checks, and time-window checks
 * all run unmocked.
 */
const NOW = () => Math.floor(Date.now() / 1000);

async function meWith(token: string): Promise<Response> {
  const db = createTestDb();
  return testRequest('/admin/me', {
    headers: { 'Cf-Access-Jwt-Assertion': token },
    env: makeDbEnv(db),
  });
}

describe('verifyJwt / requireAuth crypto path', () => {
  it('accepts a token with a valid signature and claims', async () => {
    const res = await meWith(await signTestJwt('user@test.com'));
    expect(res.status).toBe(200);
  });

  it('rejects a token whose signature was tampered with', async () => {
    const token = await signTestJwt('user@test.com');
    const [h, p] = token.split('.');
    // Re-sign body with a different payload tail but keep the original signature:
    // mutate one char of the payload so the signature no longer matches.
    const tampered = `${h}.${p.slice(0, -2)}AA.${token.split('.')[2]}`;
    const res = await meWith(tampered);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token (exp in the past)', async () => {
    const res = await meWith(await signTestJwt('user@test.com', { exp: NOW() - 60 }));
    expect(res.status).toBe(401);
  });

  it('rejects a not-yet-valid token (nbf in the future)', async () => {
    const res = await meWith(await signTestJwt('user@test.com', { nbf: NOW() + 3600 }));
    expect(res.status).toBe(401);
  });

  it('rejects a non-RS256 algorithm', async () => {
    const token = await signTestJwtRaw(
      { alg: 'HS256', kid: TEST_JWT_KID, typ: 'JWT' },
      { email: 'user@test.com', iss: TEST_JWT_ISSUER, aud: TEST_JWT_AUDIENCE, exp: NOW() + 3600 },
    );
    const res = await meWith(token);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong issuer', async () => {
    const res = await meWith(await signTestJwt('user@test.com', { iss: 'https://evil.example.com' }));
    expect(res.status).toBe(401);
  });

  it('rejects a wrong audience', async () => {
    const res = await meWith(await signTestJwt('user@test.com', { aud: 'some-other-aud' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with an unknown kid', async () => {
    const token = await signTestJwtRaw(
      { alg: 'RS256', kid: 'unknown-kid', typ: 'JWT' },
      { email: 'user@test.com', iss: TEST_JWT_ISSUER, aud: TEST_JWT_AUDIENCE, exp: NOW() + 3600 },
    );
    const res = await meWith(token);
    expect(res.status).toBe(401);
  });
});
