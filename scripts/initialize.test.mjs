import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function makeConfig(overrides = {}) {
  return {
    profile: 'local-dev',
    frontendUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8787',
    chatUrl: 'http://localhost:8788',
    defaultLocale: 'en',
    backend: {
      workerName: 'menu-backend',
      d1DatabaseName: 'menu-db',
      d1DatabaseId: 'db-id',
      r2PublicUrl: 'https://pub.example.r2.dev',
      r2BucketName: 'menu-public',
      accessTeamDomain: 'https://team.cloudflareaccess.com',
      accessAud: 'aud',
      adminEmails: 'you@example.com',
      openAiApiKey: '',
      ...overrides.backend,
    },
    chat: {
      workerName: 'menu-chat',
      kvNamespaceId: 'kv-id',
      llmProvider: 'openai',
      llmModel: 'gpt-5.4-mini',
      openAiApiKey: '',
      anthropicApiKey: '',
      chatSessionSecret: 'secret',
      refreshSecret: 'refresh',
      dailyAiRequestLimit: '',
      allowedHostSuffixes: '',
      ...overrides.chat,
    },
    ...overrides,
  };
}

test('config:generate includes PUBLIC_MENU_BUCKET binding when r2BucketName is configured', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tony-init-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(join(process.cwd(), 'scripts/initialize.mjs'), join(dir, 'scripts/initialize.mjs'));
  writeFileSync(join(dir, '.tony-menu.local.json'), JSON.stringify(makeConfig(), null, 2));

  execFileSync(process.execPath, ['scripts/initialize.mjs', '--generate'], {
    cwd: dir,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const wranglerToml = readFileSync(join(dir, 'backend/wrangler.toml'), 'utf8');
  assert.match(wranglerToml, /\[\[r2_buckets\]\]/);
  assert.match(wranglerToml, /binding = "PUBLIC_MENU_BUCKET"/);
  assert.match(wranglerToml, /bucket_name = "menu-public"/);
  assert.match(wranglerToml, /preview_bucket_name = "menu-public"/);
});

test('config:generate omits PUBLIC_MENU_BUCKET binding when r2BucketName is blank', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tony-init-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(join(process.cwd(), 'scripts/initialize.mjs'), join(dir, 'scripts/initialize.mjs'));
  writeFileSync(join(dir, '.tony-menu.local.json'), JSON.stringify(makeConfig({ backend: { r2BucketName: '' } }), null, 2));

  execFileSync(process.execPath, ['scripts/initialize.mjs', '--generate'], {
    cwd: dir,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const wranglerToml = readFileSync(join(dir, 'backend/wrangler.toml'), 'utf8');
  assert.doesNotMatch(wranglerToml, /\[\[r2_buckets\]\]/);
  assert.doesNotMatch(wranglerToml, /PUBLIC_MENU_BUCKET/);
});
