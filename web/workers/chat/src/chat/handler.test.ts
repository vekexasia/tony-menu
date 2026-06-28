import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleChat } from './handler';
import { invalidateCache } from '../menu/cache';
import { clearRateLimitStore } from '../middleware/rate-limit';
import type { Env } from '../types';
import type { ChatSession } from '../middleware/session';

const MENU_JSON = JSON.stringify({
  restaurant: { name: 'Demo' },
  categories: [],
  variants: [],
  extras: [],
  labels: [],
});

type Opts = { guard?: 'ok' | 'draft'; menuFails?: boolean };

function makeEnv(opts: Opts = {}) {
  const guard = opts.guard ?? 'ok';
  const kv = new Map<string, string>();
  if (!opts.menuFails) kv.set('menu:v1', MENU_JSON);

  const put = vi.fn(async (key: string, value: string) => { kv.set(key, value); });
  const get = vi.fn(async (key: string, type?: string) => {
    const raw = kv.get(key) ?? null;
    return type === 'json' && raw ? JSON.parse(raw) : raw;
  });

  const env = {
    LLM_PROVIDER: 'workers-ai',
    LLM_MODEL: '@cf/test',
    DAILY_AI_REQUEST_LIMIT: '5',
    AI: { run: vi.fn(async () => ({ response: 'Welcome!' })) },
    MENU_CACHE: { get, put, delete: vi.fn(async (k: string) => { kv.delete(k); }) } as unknown as KVNamespace,
    DB: {
      prepare: (sql: string) => ({
        bind: () => ({ run: vi.fn(async () => {}) }),
        first: vi.fn(async () => {
          if (sql.includes('publication_state')) {
            return guard === 'draft'
              ? { publication_state: 'draft', ai_chat_enabled: 1 }
              : { publication_state: 'published', ai_chat_enabled: 1 };
          }
          if (opts.menuFails) throw new Error('D1 down');
          return { name: 'Demo', payoff: null, chat_agent_prompt: null };
        }),
        all: vi.fn(async () => {
          if (opts.menuFails) throw new Error('D1 down');
          return { results: [] };
        }),
      }),
    } as unknown as D1Database,
  } as unknown as Env;

  return { env, put, get };
}

function makeRequest(body: unknown = { messages: [{ role: 'user', content: 'hi' }] }): Request {
  return new Request('https://x/chat', {
    method: 'POST',
    headers: { 'cf-connecting-ip': `ip-${Math.floor(performance.now() * 1000)}` },
    body: JSON.stringify(body),
  });
}

const session: ChatSession = { sid: 'sid-12345678', iat: 0 } as unknown as ChatSession;
const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

beforeEach(() => {
  invalidateCache({ MENU_CACHE: { delete: async () => {} } } as unknown as Env);
  clearRateLimitStore();
});

async function readSSE(res: Response): Promise<string> {
  return await res.text();
}

describe('handleChat orchestration', () => {
  it('streams text + done and consumes quota on the happy path', async () => {
    const { env, put } = makeEnv();
    const res = await handleChat(makeRequest(), env, {}, session, ctx);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const out = await readSSE(res);
    expect(out).toContain('Welcome!');
    expect(out).toContain('event: done');
    // quota counter written (debt item 2/3: quota consumed)
    expect(put.mock.calls.some(([k]) => String(k).startsWith('ai-requests'))).toBe(true);
  });

  it('blocks on the menu guard before consuming quota', async () => {
    const { env, put } = makeEnv({ guard: 'draft' });
    const res = await handleChat(makeRequest(), env, {}, session, ctx);
    expect(res.status).toBe(404);
    expect(put.mock.calls.some(([k]) => String(k).startsWith('ai-requests'))).toBe(false);
  });

  it('does NOT consume quota when the menu load fails (debt item 3)', async () => {
    const { env, put } = makeEnv({ menuFails: true });
    const res = await handleChat(makeRequest(), env, {}, session, ctx);
    expect(res.status).toBe(500);
    expect(put.mock.calls.some(([k]) => String(k).startsWith('ai-requests'))).toBe(false);
  });

  it('rejects an empty messages array before any provider call', async () => {
    const { env } = makeEnv();
    const res = await handleChat(makeRequest({ messages: [] }), env, {}, session, ctx);
    expect(res.status).toBe(400);
    expect((env.AI!.run as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
