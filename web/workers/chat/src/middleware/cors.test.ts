import { describe, it, expect } from 'vitest';
import { getCorsHeaders, handleCorsPreFlight } from './cors';

function makeRequest(origin: string, method = 'POST') {
  return new Request('https://chat.example.test/chat', {
    method,
    headers: { Origin: origin },
  });
}

interface MakeEnvOptions {
  verifiedDomains?: string[];
  allowedOrigins?: string;
  allowedHostSuffixes?: string;
}

function makeEnv({
  verifiedDomains = [],
  allowedOrigins,
  allowedHostSuffixes,
}: MakeEnvOptions = {}) {
  return {
    DB: {
      prepare: () => ({
        bind: (domain: string) => ({
          first: async () => verifiedDomains.includes(domain) ? { restaurant_id: 'resto-1' } : null,
        }),
      }),
    } as unknown as D1Database,
    ALLOWED_ORIGINS: allowedOrigins,
    ALLOWED_HOST_SUFFIXES: allowedHostSuffixes,
  };
}

describe('chat worker CORS', () => {
  it('allows origins from ALLOWED_ORIGINS env', async () => {
    const headers = await getCorsHeaders(
      makeRequest('https://menu.example.com'),
      makeEnv({ allowedOrigins: 'https://menu.example.com' }),
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://menu.example.com');
  });

  it('allows hostname suffixes from ALLOWED_HOST_SUFFIXES env', async () => {
    const headers = await getCorsHeaders(
      makeRequest('https://b84e49f8.preview.example.com'),
      makeEnv({ allowedHostSuffixes: '.preview.example.com' }),
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://b84e49f8.preview.example.com');
  });

  it('allows verified custom restaurant domains from D1', async () => {
    const headers = await getCorsHeaders(
      makeRequest('https://menu.example.com'),
      makeEnv({ verifiedDomains: ['menu.example.com'] }),
    );
    expect(headers['Access-Control-Allow-Origin']).toBe('https://menu.example.com');
  });

  it('rejects unverified custom restaurant domains', async () => {
    const headers = await getCorsHeaders(makeRequest('https://evil.example.com'), makeEnv());
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('rejects preflight for unverified origins', async () => {
    const res = await handleCorsPreFlight(makeRequest('https://evil.example.com', 'OPTIONS'), makeEnv());
    expect(res?.status).toBe(403);
  });

  it('allows localhost dev origins by default', async () => {
    const headers = await getCorsHeaders(makeRequest('http://localhost:3000'), makeEnv());
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });
});
