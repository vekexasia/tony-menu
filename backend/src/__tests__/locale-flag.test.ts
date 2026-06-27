import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../app';
import { makeEnv } from './helpers';
import { createTestDb, makeDbEnv, seedSettings, signTestJwt, installJwksMock } from './helpers/db';
import type { Env } from '../types';

beforeAll(() => installJwksMock());

const ADMIN_UID = 'admin-1';

type StoredObject = { body: ArrayBuffer; contentType?: string };

function makeFakeBucket() {
  const store = new Map<string, StoredObject>();
  const bucket = {
    async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      store.set(key, { body: value, contentType: opts?.httpMetadata?.contentType });
      return { key };
    },
    async delete(key: string) {
      store.delete(key);
    },
    async get(key: string) {
      const o = store.get(key);
      return o ? { body: o.body, httpMetadata: { contentType: o.contentType } } : null;
    },
    _store: store,
  };
  return bucket as unknown as R2Bucket & { _store: Map<string, StoredObject> };
}

function flagKeys(bucket: { _store: Map<string, StoredObject> }): string[] {
  return Array.from(bucket._store.keys()).filter((k) => k.startsWith('images/settings/flag-'));
}

function makeJpeg(extraBytes = 100): ArrayBuffer {
  const buf = new Uint8Array(3 + extraBytes);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf.buffer;
}

async function adminEnv() {
  const db = createTestDb();
  seedSettings(db);
  const bucket = makeFakeBucket();
  const env = makeDbEnv(db, {
    ADMIN_EMAILS: ADMIN_UID,
    PUBLIC_MENU_BUCKET: bucket,
    R2_PUBLIC_URL: 'https://cdn.example.com',
  } as Partial<Env>);
  const token = await signTestJwt(ADMIN_UID);
  return { db, env, bucket, headers: { 'Cf-Access-Jwt-Assertion': token } };
}

async function fetchApp(path: string, init: RequestInit, env: Env): Promise<Response> {
  const app = createApp();
  return app.fetch(new Request(`https://test.local${path}`, init), env);
}

async function setCustomLocales(env: Env, headers: Record<string, string>, locales: { code: string; name: string; flagUrl?: string | null }[]) {
  const res = await fetchApp('/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ customLocales: locales }),
  }, env);
  expect(res.status).toBe(200);
}

describe('POST /admin/locale-flag/:code', () => {
  it('uploads a flag and stores the URL on the matching custom locale', async () => {
    const { env, headers, bucket } = await adminEnv();
    await setCustomLocales(env, headers, [{ code: 'vec', name: 'Veneto' }]);

    const res = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: true; flagUrl: string };
    expect(body.flagUrl).toMatch(/^https:\/\/cdn\.example\.com\/images\/settings\/flag-vec-\d+\.jpg$/);
    expect(flagKeys(bucket)).toHaveLength(1);

    const settings = await fetchApp('/admin/settings', { method: 'GET', headers }, env);
    const settingsBody = await settings.json() as { customLocales?: { code: string; flagUrl?: string }[] };
    const vec = settingsBody.customLocales?.find((l) => l.code === 'vec');
    expect(vec?.flagUrl).toBe(body.flagUrl);
  });

  it('rejects an invalid locale code', async () => {
    const { env, headers } = await adminEnv();
    const res = await fetchApp('/admin/locale-flag/UPPER', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);
    expect(res.status).toBe(400);
  });

  it('returns 404 when the custom locale does not exist', async () => {
    const { env, headers } = await adminEnv();
    const res = await fetchApp('/admin/locale-flag/zzz', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);
    expect(res.status).toBe(404);
  });

  it('rejects non-image bodies with 415', async () => {
    const { env, headers } = await adminEnv();
    await setCustomLocales(env, headers, [{ code: 'vec', name: 'Veneto' }]);
    const garbage = new Uint8Array(16).fill(0xAB).buffer;
    const res = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: garbage,
    }, env);
    expect(res.status).toBe(415);
  });

  it('deletes the previous R2 object on re-upload', async () => {
    const { env, headers, bucket } = await adminEnv();
    await setCustomLocales(env, headers, [{ code: 'vec', name: 'Veneto' }]);

    const first = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);
    expect(first.status).toBe(200);
    expect(flagKeys(bucket)).toHaveLength(1);
    const firstKey = flagKeys(bucket)[0];

    await new Promise((r) => setTimeout(r, 2));

    const second = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);
    expect(second.status).toBe(200);
    expect(flagKeys(bucket)).toHaveLength(1);
    const secondKey = flagKeys(bucket)[0];
    expect(secondKey).not.toBe(firstKey);
  });

  it('requires admin auth', async () => {
    const db = createTestDb();
    seedSettings(db);
    const bucket = makeFakeBucket();
    const env = makeDbEnv(db, {
      ADMIN_EMAILS: 'someone-else',
      PUBLIC_MENU_BUCKET: bucket,
      R2_PUBLIC_URL: 'https://cdn.example.com',
    } as Partial<Env>);
    void makeEnv;

    const res = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: makeJpeg(),
    }, env);
    expect([401, 403]).toContain(res.status);
  });
});

describe('DELETE /admin/locale-flag/:code', () => {
  it('clears flagUrl and removes the R2 object', async () => {
    const { env, headers, bucket } = await adminEnv();
    await setCustomLocales(env, headers, [{ code: 'vec', name: 'Veneto' }]);

    const upload = await fetchApp('/admin/locale-flag/vec', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...headers },
      body: makeJpeg(),
    }, env);
    expect(upload.status).toBe(200);
    expect(flagKeys(bucket)).toHaveLength(1);

    const del = await fetchApp('/admin/locale-flag/vec', { method: 'DELETE', headers }, env);
    expect(del.status).toBe(200);
    expect(flagKeys(bucket)).toHaveLength(0);

    const settings = await fetchApp('/admin/settings', { method: 'GET', headers }, env);
    const body = await settings.json() as { customLocales?: { code: string; flagUrl?: string | null }[] };
    expect(body.customLocales?.find((l) => l.code === 'vec')?.flagUrl ?? null).toBeNull();
  });

  it('returns 200 and changes nothing when the locale has no flag', async () => {
    const { env, headers, bucket } = await adminEnv();
    await setCustomLocales(env, headers, [{ code: 'vec', name: 'Veneto' }]);

    const del = await fetchApp('/admin/locale-flag/vec', { method: 'DELETE', headers }, env);
    expect(del.status).toBe(200);
    expect(flagKeys(bucket)).toHaveLength(0);

    const settings = await fetchApp('/admin/settings', { method: 'GET', headers }, env);
    const body = await settings.json() as { customLocales?: { code: string; flagUrl?: string | null }[] };
    expect(body.customLocales?.find((l) => l.code === 'vec')?.flagUrl ?? null).toBeNull();
  });

  it('rejects an invalid locale code with 400', async () => {
    const { env, headers } = await adminEnv();
    const res = await fetchApp('/admin/locale-flag/UPPER', { method: 'DELETE', headers }, env);
    expect(res.status).toBe(400);
  });
});
