#!/usr/bin/env node
/**
 * verify:config — compares the local .tony-menu.local.json config against
 * what is actually deployed on Cloudflare (worker bindings + D1/KV lists).
 *
 * Exits 0 if everything matches, 1 if any drift is detected.
 *
 * Usage: npm run verify:config
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CONFIG_PATH = '.tony-menu.local.json';
const WRANGLER_CONFIG = '.config/.wrangler/config/default.toml';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function section(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }

// ── Load local config ─────────────────────────────────────────────────────────

if (!existsSync(CONFIG_PATH)) {
  console.error(`${RED}✗ ${CONFIG_PATH} not found. Run: npm run initialize${RESET}`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const { backend, chat } = config;

// ── Load wrangler OAuth token ─────────────────────────────────────────────────

const wranglerConfigPath = `${process.env.HOME}/${WRANGLER_CONFIG}`;
if (!existsSync(wranglerConfigPath)) {
  console.error(`${RED}✗ Wrangler not authenticated. Run: npx wrangler login${RESET}`);
  process.exit(1);
}

const wranglerConfig = readFileSync(wranglerConfigPath, 'utf8');
const tokenMatch = wranglerConfig.match(/oauth_token\s*=\s*"([^"]+)"/);
if (!tokenMatch) {
  console.error(`${RED}✗ Could not read OAuth token from wrangler config.${RESET}`);
  process.exit(1);
}
const token = tokenMatch[1];

// ── Cloudflare API helpers ────────────────────────────────────────────────────

async function cfGet(path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  if (!body.success) throw new Error(`CF API error: ${body.errors?.[0]?.message ?? JSON.stringify(body.errors)}`);
  return body.result;
}

async function getAccountId() {
  const result = await cfGet('/accounts?per_page=1');
  return result?.[0]?.id;
}

async function getWorkerBindings(accountId, workerName) {
  try {
    return await cfGet(`/accounts/${accountId}/workers/scripts/${workerName}/bindings`);
  } catch {
    return null;
  }
}

async function getD1Databases(accountId) {
  return await cfGet(`/accounts/${accountId}/d1/database?per_page=100`);
}

async function getKVNamespaces(accountId) {
  return await cfGet(`/accounts/${accountId}/storage/kv/namespaces?per_page=100`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

let driftCount = 0;

function check(label, expected, actual) {
  if (expected === actual) {
    ok(`${label}: ${DIM}${actual}${RESET}`);
  } else {
    fail(`${label}: expected ${BOLD}${expected}${RESET} but deployed has ${BOLD}${actual ?? '(missing)'}${RESET}`);
    driftCount++;
  }
}

console.log(`\n${BOLD}Verifying deployment config against ${CONFIG_PATH}${RESET}`);
console.log(`${DIM}Fetching Cloudflare data…${RESET}`);

const accountId = await getAccountId();

// ── D1 databases ──────────────────────────────────────────────────────────────

section('D1 databases');

const d1Databases = await getD1Databases(accountId);
const d1ById = Object.fromEntries(d1Databases.map(db => [db.uuid, db]));
const d1ByName = Object.fromEntries(d1Databases.map(db => [db.name, db]));

const expectedD1Id = backend.d1DatabaseId;
const expectedD1Name = backend.d1DatabaseName;

if (d1ById[expectedD1Id]) {
  ok(`D1 id ${DIM}${expectedD1Id}${RESET} exists (name: ${d1ById[expectedD1Id].name})`);
} else {
  fail(`D1 id ${expectedD1Id} not found in account`);
  driftCount++;
}

if (d1ByName[expectedD1Name]) {
  if (d1ByName[expectedD1Name].uuid === expectedD1Id) {
    ok(`D1 name "${expectedD1Name}" matches id`);
  } else {
    fail(`D1 name "${expectedD1Name}" exists but has id ${d1ByName[expectedD1Name].uuid}, expected ${expectedD1Id}`);
    driftCount++;
  }
} else {
  fail(`D1 database named "${expectedD1Name}" not found in account`);
  driftCount++;
}

// ── KV namespaces ─────────────────────────────────────────────────────────────

section('KV namespaces');

const kvNamespaces = await getKVNamespaces(accountId);
const kvById = Object.fromEntries(kvNamespaces.map(ns => [ns.id, ns]));

const expectedKvId = chat.kvNamespaceId;

if (kvById[expectedKvId]) {
  ok(`KV id ${DIM}${expectedKvId}${RESET} exists (title: ${kvById[expectedKvId].title})`);
} else {
  fail(`KV id ${expectedKvId} not found in account`);
  driftCount++;
}

// ── menu-chat worker bindings ─────────────────────────────────────────────────

section(`Worker: ${chat.workerName}`);

const chatBindings = await getWorkerBindings(accountId, chat.workerName);
if (!chatBindings) {
  warn(`Worker "${chat.workerName}" not found or not yet deployed — skipping binding checks`);
} else {
  const byName = Object.fromEntries(chatBindings.map(b => [b.name, b]));

  // D1 binding
  const dbBinding = byName['DB'];
  if (!dbBinding) {
    fail('DB binding is missing from deployed worker');
    driftCount++;
  } else {
    check('DB binding id', expectedD1Id, dbBinding.database_id);
  }

  // KV binding
  const kvBinding = byName['MENU_CACHE'];
  if (!kvBinding) {
    fail('MENU_CACHE binding is missing from deployed worker');
    driftCount++;
  } else {
    check('MENU_CACHE binding id', expectedKvId, kvBinding.namespace_id);
  }

  // ALLOWED_HOST_SUFFIXES
  const hostSuffixBinding = byName['ALLOWED_HOST_SUFFIXES'];
  const deployedSuffix = hostSuffixBinding?.text ?? '';
  const expectedSuffix = chat.allowedHostSuffixes ?? '';
  if (expectedSuffix && !deployedSuffix) {
    fail(`ALLOWED_HOST_SUFFIXES is empty in deployed worker (expected "${expectedSuffix}")`);
    driftCount++;
  } else if (!expectedSuffix && deployedSuffix) {
    warn(`ALLOWED_HOST_SUFFIXES is "${deployedSuffix}" in deployed worker but empty in local config`);
  } else {
    check('ALLOWED_HOST_SUFFIXES', expectedSuffix, deployedSuffix);
  }

  // Secrets present (can't read values, just check they exist)
  for (const secretName of ['CHAT_SESSION_SECRET', 'OPENAI_API_KEY']) {
    if (byName[secretName]) {
      ok(`Secret ${secretName} is set`);
    } else {
      fail(`Secret ${secretName} is missing from deployed worker`);
      driftCount++;
    }
  }
}

// ── menu-backend worker bindings ──────────────────────────────────────────────

section(`Worker: ${backend.workerName}`);

const backendBindings = await getWorkerBindings(accountId, backend.workerName);
if (!backendBindings) {
  warn(`Worker "${backend.workerName}" not found or not yet deployed — skipping binding checks`);
} else {
  const byName = Object.fromEntries(backendBindings.map(b => [b.name, b]));

  const dbBinding = byName['DB'];
  if (!dbBinding) {
    fail('DB binding is missing from deployed backend worker');
    driftCount++;
  } else {
    check('DB binding id', expectedD1Id, dbBinding.database_id);
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

console.log('');
if (driftCount === 0) {
  console.log(`${GREEN}${BOLD}✓ All checks passed — local config matches deployed workers.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}✗ ${driftCount} check(s) failed — config has drifted from deployed state.${RESET}`);
  console.log(`${DIM}  Fix .tony-menu.local.json, run: npm run config:generate && npm run deploy${RESET}\n`);
  process.exit(1);
}
