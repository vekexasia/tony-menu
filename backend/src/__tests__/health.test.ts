import { describe, it, expect } from 'vitest';
import { testRequest } from './helpers';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await testRequest('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('risto-test');
  });

  it('includes environment and version info', async () => {
    const res = await testRequest('/health');
    const body = await res.json() as Record<string, unknown>;
    expect(body.environment).toBe('development');
    expect(body.apiVersion).toBe('v1');
    expect(typeof body.timestamp).toBe('string');
  });

  it('includes backend commit SHA when provided by deployment', async () => {
    const res = await testRequest('/health', {
      env: { COMMIT_SHA: 'ced844cafebabedeadbeef' },
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.commitSha).toBe('ced844cafebabedeadbeef');
  });

  it('reports auth configured when issuer + audience set', async () => {
    const res = await testRequest('/health');
    const body = await res.json() as Record<string, unknown>;
    expect(body.authConfigured).toBe(true);
  });

  it('reports auth NOT configured when issuer missing', async () => {
    const res = await testRequest('/health', {
      env: { ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined },
    });
    const body = await res.json() as Record<string, unknown>;
    expect(body.authConfigured).toBe(false);
  });
});

describe('GET /ready', () => {
  it('returns 503 when database is not configured', async () => {
    const res = await testRequest('/ready');
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ready).toBe(false);
    expect((body.checks as Record<string, unknown>).databaseConfigured).toBe(false);
  });

  it('returns 200 when D1 binding is present', async () => {
    const res = await testRequest('/ready', {
      env: { DB: {} as D1Database },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect((body.checks as Record<string, unknown>).databaseConfigured).toBe(true);
  });
});

describe('GET /', () => {
  it('returns service info', async () => {
    const res = await testRequest('/');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.service).toBe('risto-test');
    expect(body.safeMode).toBe(true);
  });
});

describe('404', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await testRequest('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
