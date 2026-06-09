import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

interface Args {
  restaurant?: string;
  limit: number;
  out?: string;
  format: 'json' | 'md';
  local: boolean;
}

interface WranglerJsonResult<T> {
  results?: T[];
  success: boolean;
  error?: string;
}

interface ChatSessionRow {
  id: string;
  uid: string;
  locale: string;
  duration_ms: number;
  created_at: number;
  created_at_iso: string;
  messages: string;
  tool_calls: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSessionExport extends Omit<ChatSessionRow, 'messages' | 'tool_calls'> {
  messages: ChatMessage[];
  tool_calls: string[];
}

function usage(): never {
  console.log(`Download persisted AI chat sessions from D1.

Usage:
  npm run chat:sessions -- [options]

Options:
  --restaurant <id>   Filter by restaurant id (slug)
  --limit <n>         Max sessions to download (default: 100)
  --out <path>        Output file path (default: exports/chat-sessions-<timestamp>.<format>)
  --format <json|md>  Output format (default: json)
  --local             Query local D1 instead of remote production D1
  --help              Show this help

Examples:
  npm run chat:sessions -- --restaurant <slug> --limit 50
  npm run chat:sessions -- --restaurant <slug> --format md --out exports/<slug>-chat.md
  npm run chat:sessions -- --limit 500 --out exports/all-chat-sessions.json
`);
  process.exit(0);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: 100, format: 'json', local: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--local') {
      args.local = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--restaurant') {
      args.restaurant = next;
      i += 1;
    } else if (arg === '--limit') {
      args.limit = Number.parseInt(next, 10);
      if (!Number.isFinite(args.limit) || args.limit < 1) throw new Error('--limit must be a positive number');
      i += 1;
    } else if (arg === '--out') {
      args.out = next;
      i += 1;
    } else if (arg === '--format') {
      if (next !== 'json' && next !== 'md') throw new Error('--format must be json or md');
      args.format = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildQuery(args: Args): string {
  // menu-db.chat_sessions has no restaurant_id column — filter is not supported
  if (args.restaurant) {
    console.warn('--restaurant filter is not supported for menu-db (no restaurant_id column)');
  }
  return `select
    id,
    uid,
    locale,
    duration_ms,
    created_at,
    datetime(created_at / 1000, 'unixepoch') as created_at_iso,
    messages,
    tool_calls
  from chat_sessions
  order by created_at desc
  limit ${args.limit};`;
}

function runWranglerQuery<T>(query: string, local: boolean): T[] {
  const wranglerArgs = ['wrangler', 'd1', 'execute', 'menu-db', '--json', '--command', query];
  if (!local) wranglerArgs.splice(4, 0, '--remote');

  const result = spawnSync('npx', wranglerArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`wrangler d1 execute failed:\n${result.stderr || result.stdout}`);
  }

  const parsed = JSON.parse(result.stdout) as WranglerJsonResult<T>[];
  const first = parsed[0];
  if (!first?.success) throw new Error(first?.error ?? 'D1 query failed');
  return first.results ?? [];
}

function parseJsonField<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeRows(rows: ChatSessionRow[]): ChatSessionExport[] {
  return rows.map((row) => ({
    ...row,
    messages: parseJsonField<ChatMessage[]>(row.messages, []),
    tool_calls: parseJsonField<string[]>(row.tool_calls, []),
  }));
}

function defaultOutPath(format: Args['format']): string {
  const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  return `exports/chat-sessions-${stamp}.${format}`;
}

function renderMarkdown(sessions: ChatSessionExport[]): string {
  const lines: string[] = ['# Chat sessions', ''];

  for (const session of sessions) {
    lines.push(`## ${session.created_at_iso} — ${session.uid}`);
    lines.push('');
    lines.push(`- id: \`${session.id}\``);
    lines.push(`- uid: \`${session.uid}\``);
    lines.push(`- locale: \`${session.locale}\``);
    lines.push(`- duration: ${session.duration_ms}ms`);
    if (session.tool_calls.length) lines.push(`- tool calls: ${session.tool_calls.map((t) => `\`${t}\``).join(', ')}`);
    lines.push('');

    for (const message of session.messages) {
      lines.push(`**${message.role}:**`);
      lines.push('');
      lines.push(message.content.trim() || '_empty_');
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = buildQuery(args);
  const rows = runWranglerQuery<ChatSessionRow>(query, args.local);
  const sessions = normalizeRows(rows);

  const out = resolve(args.out ?? defaultOutPath(args.format));
  mkdirSync(dirname(out), { recursive: true });

  const content = args.format === 'json'
    ? `${JSON.stringify(sessions, null, 2)}\n`
    : renderMarkdown(sessions);

  writeFileSync(out, content, 'utf8');
  console.log(`Downloaded ${sessions.length} chat session(s) to ${out}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
