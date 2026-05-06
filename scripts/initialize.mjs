#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const CONFIG_PATH = '.risto-menu.local.json';
const GENERATED_HEADER = '# Generated from .risto-menu.local.json. Do not edit directly.\n# Run: npm run config:generate\n';
const yes = process.argv.includes('--yes') || process.argv.includes('-y');
const force = process.argv.includes('--force') || process.argv.includes('-f');
const generateOnly = process.argv.includes('--generate');
const rl = createInterface({ input, output });

const DEFAULT_CONFIG = {
  profile: 'local-dev',
  frontendUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:8787',
  chatUrl: 'http://localhost:8788',
  defaultLocale: 'en',
  backend: {
    workerName: 'menu-backend',
    d1DatabaseName: 'menu-db',
    d1DatabaseId: '00000000-0000-0000-0000-000000000000',
    r2BucketName: '',
    r2PublicUrl: 'https://pub-XXXXXXXX.r2.dev',
    r2BucketName: '',
    accessTeamDomain: 'https://your-team.cloudflareaccess.com',
    accessAud: 'your-access-aud-tag',
    adminEmails: 'you@example.com',
    openAiApiKey: '',
    allowedOrigins: '',
    allowedHostSuffixes: '',
  },
  chat: {
    workerName: 'menu-chat',
    kvNamespaceId: '00000000000000000000000000000000',
    llmProvider: 'openai',
    llmModel: 'gpt-5.4-mini',
    openAiApiKey: '',
    anthropicApiKey: '',
    chatSessionSecret: '',
    refreshSecret: '',
    dailyAiRequestLimit: '',
    allowedHostSuffixes: '',
  },
};

function secret() {
  return randomBytes(32).toString('hex');
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  return deepMerge(DEFAULT_CONFIG, JSON.parse(readFileSync(CONFIG_PATH, 'utf8')));
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

async function ask(label, fallback = '') {
  if (yes) return fallback;
  const suffix = fallback ? ` (${fallback})` : '';
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || fallback;
}

async function choose(label, choices, fallback) {
  if (yes) return fallback;
  const text = choices.map((c, i) => `${i + 1}) ${c}`).join('  ');
  const raw = (await rl.question(`${label} ${text} (${fallback}): `)).trim();
  if (!raw) return fallback;
  const index = Number(raw);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) return choices[index - 1];
  if (choices.includes(raw)) return raw;
  console.log(`Please choose one of: ${choices.join(', ')}`);
  return choose(label, choices, fallback);
}

async function confirm(label, fallback = false) {
  if (yes) return fallback;
  const hint = fallback ? 'Y/n' : 'y/N';
  const raw = (await rl.question(`${label} (${hint}): `)).trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'y' || raw === 'yes';
}

function withProfileDefaults(config) {
  const next = structuredClone(config);
  const isDemo = next.profile === 'public-demo';
  const isProdLike = next.profile !== 'local-dev';

  if (isDemo) {
    next.frontendUrl = next.frontendUrl || 'https://menu.example.com';
    next.apiUrl = next.apiUrl || 'https://menu-api.example.com';
    next.chatUrl = next.chatUrl || 'https://menu-chat.example.workers.dev';
    next.backend.workerName = next.backend.workerName === 'menu-backend' ? 'risto-menu-demo-api' : next.backend.workerName;
    next.backend.d1DatabaseName = next.backend.d1DatabaseName === 'menu-db' ? 'risto-menu-demo-db' : next.backend.d1DatabaseName;
    next.chat.workerName = next.chat.workerName === 'menu-chat' ? 'risto-menu-demo-chat' : next.chat.workerName;
    next.chat.llmProvider = next.chat.llmProvider === 'openai' ? 'workers-ai' : next.chat.llmProvider;
    next.chat.llmModel = next.chat.llmModel === 'gpt-5.4-mini' ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast' : next.chat.llmModel;
    next.chat.dailyAiRequestLimit = next.chat.dailyAiRequestLimit || '200';
    next.chat.allowedHostSuffixes = next.chat.allowedHostSuffixes || '.pages.dev';
  }

  if (isProdLike && next.frontendUrl === 'http://localhost:3000') next.frontendUrl = 'https://menu.example.com';
  if (isProdLike && next.apiUrl === 'http://localhost:8787') next.apiUrl = 'https://menu-api.example.com';
  if (isProdLike && next.chatUrl === 'http://localhost:8788') next.chatUrl = 'https://menu-chat.example.workers.dev';
  if (!isProdLike) next.chat.allowedHostSuffixes = '';

  next.chat.chatSessionSecret = next.chat.chatSessionSecret || secret();
  next.chat.refreshSecret = next.chat.refreshSecret || secret();
  return next;
}

async function collectConfig(existing) {
  let config = withProfileDefaults(existing || DEFAULT_CONFIG);

  config.profile = await choose('Setup profile:', ['local-dev', 'production', 'public-demo'], config.profile);
  config = withProfileDefaults(config);
  const isDemo = config.profile === 'public-demo';
  const isProdLike = config.profile !== 'local-dev';

  config.frontendUrl = await ask('Frontend URL', config.frontendUrl);
  config.apiUrl = await ask('Backend API URL', config.apiUrl);
  config.chatUrl = await ask('Chat worker URL', config.chatUrl);
  config.defaultLocale = await ask('Default locale', config.defaultLocale);

  config.backend.workerName = await ask('Backend Worker name', config.backend.workerName);
  config.chat.workerName = await ask('Chat Worker name', config.chat.workerName);
  config.backend.d1DatabaseName = await ask('D1 database name', config.backend.d1DatabaseName);
  config.backend.d1DatabaseId = await ask('D1 database id', config.backend.d1DatabaseId);
  config.chat.kvNamespaceId = await ask('Chat KV namespace id', config.chat.kvNamespaceId);
  config.backend.r2PublicUrl = await ask('R2 public URL for images/catalog snapshots', config.backend.r2PublicUrl);
  config.backend.r2BucketName = await ask('R2 bucket name for images/catalog snapshots (blank disables R2 binding)', config.backend.r2BucketName);

  if (!isDemo) {
    config.backend.adminEmails = await ask('Admin email(s), comma-separated', config.backend.adminEmails);
    if (isProdLike) {
      config.backend.accessTeamDomain = await ask('Cloudflare Access team domain', config.backend.accessTeamDomain);
      config.backend.accessAud = await ask('Cloudflare Access AUD tag', config.backend.accessAud);
    }
  }

  config.chat.llmProvider = await choose('Chat LLM provider:', ['openai', 'anthropic', 'workers-ai'], config.chat.llmProvider);
  config.chat.llmModel = config.chat.llmProvider === 'workers-ai'
    ? await ask('Workers AI model', config.chat.llmModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    : config.chat.llmProvider === 'anthropic'
      ? await ask('Anthropic model', config.chat.llmModel || 'claude-haiku-4-5-20251001')
      : await ask('OpenAI model', config.chat.llmModel || 'gpt-5.4-mini');

  if (config.chat.llmProvider === 'openai') config.chat.openAiApiKey = await ask('OpenAI API key for local dev (blank allowed)', config.chat.openAiApiKey);
  if (config.chat.llmProvider === 'anthropic') config.chat.anthropicApiKey = await ask('Anthropic API key for local dev (blank allowed)', config.chat.anthropicApiKey);
  config.backend.openAiApiKey = await ask('Backend OpenAI API key for admin translations (blank allowed)', config.backend.openAiApiKey);
  config.chat.chatSessionSecret = await ask('Chat session secret', config.chat.chatSessionSecret || secret());
  config.chat.refreshSecret = await ask('Menu refresh/debug secret', config.chat.refreshSecret || secret());
  config.chat.dailyAiRequestLimit = isDemo ? await ask('Daily AI request cap for demo', config.chat.dailyAiRequestLimit || '200') : config.chat.dailyAiRequestLimit;

  return config;
}

function csv(values) {
  return values.filter(Boolean).join(',');
}

function generate(config) {
  const isDemo = config.profile === 'public-demo';
  const isProdLike = config.profile !== 'local-dev';
  const allowedOrigins = isProdLike
    ? csv([config.frontendUrl, config.backend.allowedOrigins])
    : csv(['http://localhost:3000', config.frontendUrl !== 'http://localhost:3000' ? config.frontendUrl : '', config.backend.allowedOrigins]);
  const backendAllowedHostSuffixes = config.backend.allowedHostSuffixes || config.chat.allowedHostSuffixes;

  const backendToml = `${GENERATED_HEADER}name = "${config.backend.workerName}"
main = "src/index.ts"
compatibility_date = "2025-04-11"

[vars]
APP_ENV = "${isProdLike ? 'production' : 'development'}"
API_VERSION = "v1"
SERVICE_NAME = "menu-backend"
DEMO_MODE = "${isDemo ? 'true' : 'false'}"
R2_PUBLIC_URL = "${config.backend.r2PublicUrl}"
ACCESS_TEAM_DOMAIN = "${config.backend.accessTeamDomain}"
ACCESS_AUD = "${config.backend.accessAud}"
ADMIN_EMAILS = "${isDemo ? 'demo-admin@risto.menu' : config.backend.adminEmails}"
ALLOWED_ORIGINS = "${allowedOrigins}"
${backendAllowedHostSuffixes ? `ALLOWED_HOST_SUFFIXES = "${backendAllowedHostSuffixes}"\n` : ''}
[[d1_databases]]
binding = "DB"
database_name = "${config.backend.d1DatabaseName}"
database_id = "${config.backend.d1DatabaseId}"
migrations_dir = "drizzle"
${config.backend.r2BucketName ? `\n[[r2_buckets]]\nbinding = "PUBLIC_MENU_BUCKET"\nbucket_name = "${config.backend.r2BucketName}"\npreview_bucket_name = "${config.backend.r2BucketName}"\n` : ''}${isDemo ? '\n[triggers]\ncrons = ["0 * * * *"]\n' : ''}`;

  const backendDevVars = `${GENERATED_HEADER}OPENAI_API_KEY=${config.backend.openAiApiKey}
`;

  const chatToml = `${GENERATED_HEADER}name = "${config.chat.workerName}"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[[kv_namespaces]]
binding = "MENU_CACHE"
id = "${config.chat.kvNamespaceId}"

[[d1_databases]]
binding = "DB"
database_name = "${config.backend.d1DatabaseName}"
database_id = "${config.backend.d1DatabaseId}"
migrations_dir = "../../../backend/drizzle"
${config.chat.llmProvider === 'workers-ai' ? '\n[ai]\nbinding = "AI"\n' : ''}
[vars]
LLM_PROVIDER = "${config.chat.llmProvider}"
LLM_MODEL = "${config.chat.llmModel}"
ALLOWED_ORIGINS = "${csv([config.frontendUrl, config.backend.allowedOrigins])}"
ALLOWED_HOST_SUFFIXES = "${config.chat.allowedHostSuffixes}"
${config.chat.dailyAiRequestLimit ? `DAILY_AI_REQUEST_LIMIT = "${config.chat.dailyAiRequestLimit}"\n` : ''}`;

  const chatDevVars = `${GENERATED_HEADER}OPENAI_API_KEY=${config.chat.openAiApiKey}
ANTHROPIC_API_KEY=${config.chat.anthropicApiKey}
CHAT_SESSION_SECRET=${config.chat.chatSessionSecret}
REFRESH_SECRET=${config.chat.refreshSecret}
`;

  const webEnv = `${GENERATED_HEADER}NEXT_PUBLIC_API_URL=${config.apiUrl}
NEXT_PUBLIC_CHAT_WORKER_URL=${config.chatUrl}
NEXT_PUBLIC_DEFAULT_LOCALE=${config.defaultLocale}
`;

  write('backend/wrangler.toml', backendToml);
  write('backend/.dev.vars', backendDevVars);
  write('web/workers/chat/wrangler.toml', chatToml);
  write('web/workers/chat/.dev.vars', chatDevVars);
  write('web/.env.local', webEnv);
}

function printNextSteps(config) {
  console.log('\nNext steps\n');
  if (config.backend.d1DatabaseId.startsWith('00000000')) {
    console.log('1. Create D1, then update `.risto-menu.local.json` and run `npm run config:generate`:');
    console.log(`   cd backend && npx wrangler d1 create ${config.backend.d1DatabaseName}`);
  } else {
    console.log('1. D1 database id is set.');
  }
  if (/^0{32}$/.test(config.chat.kvNamespaceId)) {
    console.log('2. Create chat KV, then update `.risto-menu.local.json` and run `npm run config:generate`:');
    console.log('   cd web/workers/chat && npx wrangler kv namespace create MENU_CACHE');
  } else {
    console.log('2. Chat KV namespace id is set.');
  }
  if (!config.backend.r2BucketName) {
    console.log('3. Optional but recommended: create an R2 bucket, update `.risto-menu.local.json`, then run `npm run config:generate`:');
    console.log('   cd backend && npx wrangler r2 bucket create menu-public');
  } else {
    console.log(`3. R2 bucket name is set (${config.backend.r2BucketName}).`);
  }
  console.log('4. Apply D1 migrations:');
  console.log(`   cd backend && npx wrangler d1 migrations apply ${config.backend.d1DatabaseName} --local`);
  console.log('5. Start dev servers in separate terminals:');
  console.log('   cd backend && npm run dev');
  console.log('   cd web/workers/chat && npm run dev');
  console.log('   cd web && npm run dev');

  if (config.profile !== 'local-dev') {
    console.log('\nProduction secrets to set with wrangler before deploy:');
    if (config.chat.llmProvider === 'openai') console.log('   cd web/workers/chat && npx wrangler secret put OPENAI_API_KEY');
    if (config.chat.llmProvider === 'anthropic') console.log('   cd web/workers/chat && npx wrangler secret put ANTHROPIC_API_KEY');
    console.log('   cd web/workers/chat && npx wrangler secret put CHAT_SESSION_SECRET');
    console.log('   cd web/workers/chat && npx wrangler secret put REFRESH_SECRET');
    console.log('   cd backend && npx wrangler secret put OPENAI_API_KEY   # only if you use admin AI translations');
  }
}

console.log('\nRisto Menu initializer\n');
console.log('`.risto-menu.local.json` is the source of truth. Runtime env/TOML files are generated from it.');
console.log('Generated files and the source-of-truth file are gitignored.\n');

let config = loadConfig();
if (generateOnly) {
  if (!config) {
    console.error(`Missing ${CONFIG_PATH}. Run npm run initialize first.`);
    process.exitCode = 1;
  } else {
    generate(config);
    printNextSteps(config);
  }
  rl.close();
} else {
  if (config && !force) {
    const editExisting = await confirm(`${CONFIG_PATH} already exists. Update it interactively?`, true);
    if (!editExisting) {
      generate(config);
      printNextSteps(config);
      rl.close();
    } else {
      config = await collectConfig(config);
      write(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
      generate(config);
      printNextSteps(config);
      rl.close();
    }
  } else {
    config = await collectConfig(config || DEFAULT_CONFIG);
    write(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    generate(config);
    printNextSteps(config);
    rl.close();
  }
}
