#!/usr/bin/env -S npx ts-node --esm
/**
 * Integration test for the chat worker.
 * Usage: npx ts-node --esm scripts/test-chat.ts
 *   or:  bun scripts/test-chat.ts
 *
 * Requires wrangler dev running on port 8787 (or 8788 with --port override).
 */

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787';
const RESTAURANT_ID = process.env.TEST_RESTAURANT_ID || 'demo-restaurant';

// ANSI colours
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Anonymous chat session ──────────────────────────────────────────────────

async function getChatSessionToken(): Promise<string> {
  const res = await fetch(`${WORKER_URL}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
    },
    body: JSON.stringify({ restaurantId: RESTAURANT_ID }),
  });
  if (!res.ok) throw new Error(`Chat session failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { token: string };
  return data.token;
}

// ── SSE parser ───────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  data: unknown;
}

async function parseSse(response: Response): Promise<SSEEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventType = '';
  let eventData = '';
  const events: SSEEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6);
      } else if (line === '' && eventType && eventData) {
        try {
          events.push({ type: eventType, data: JSON.parse(eventData) });
        } catch {
          events.push({ type: eventType, data: eventData });
        }
        eventType = '';
        eventData = '';
      }
    }
  }

  return events;
}

// ── Chat turn ────────────────────────────────────────────────────────────────

interface TurnResult {
  text: string;
  toolCalls: Array<{ name: string; params: Record<string, unknown> }>;
  error?: string;
}

type Message = { role: 'user' | 'assistant'; content: string };

async function chatTurn(messages: Message[], token: string, locale = 'it'): Promise<TurnResult> {
  const res = await fetch(`${WORKER_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Origin': 'http://localhost:3000',
    },
    body: JSON.stringify({ messages, restaurantId: RESTAURANT_ID, locale }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { text: '', toolCalls: [], error: `HTTP ${res.status}: ${body}` };
  }

  const events = await parseSse(res);
  let text = '';
  const toolCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

  for (const ev of events) {
    if (ev.type === 'text') {
      text += (ev.data as { text: string }).text;
    } else if (ev.type === 'tool_call') {
      const tc = ev.data as { name: string; params: Record<string, unknown> };
      toolCalls.push({ name: tc.name, params: tc.params });
    } else if (ev.type === 'error') {
      return { text, toolCalls, error: (ev.data as { message: string }).message };
    }
  }

  return { text: text.trim(), toolCalls };
}

// ── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ${GREEN}✓${RESET} ${label}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${label}${detail ? `\n    ${RED}→ ${detail}${RESET}` : ''}`);
    failed++;
  }
}

function printTurn(result: TurnResult) {
  const textPreview = result.text.length > 120 ? result.text.slice(0, 120) + '…' : result.text;
  console.log(`  ${CYAN}text:${RESET}  "${textPreview}"`);
  for (const tc of result.toolCalls) {
    const paramsStr = JSON.stringify(tc.params).slice(0, 100);
    console.log(`  ${CYAN}tool:${RESET}  ${tc.name}(${paramsStr})`);
  }
  if (result.error) console.log(`  ${RED}error:${RESET} ${result.error}`);
}

function hasToolCall(result: TurnResult, name: string): boolean {
  return result.toolCalls.some(tc => tc.name === name);
}

function toolCallIds(result: TurnResult, name: string): string[] {
  const tc = result.toolCalls.find(t => t.name === name);
  if (!tc) return [];
  const ids = tc.params.item_ids as string[] | undefined;
  return ids || [];
}

// ── Test scenarios ────────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${BOLD}Chat Worker Integration Tests${RESET}`);
  console.log(`Target: ${WORKER_URL}\n`);

  // Get anonymous chat session token
  process.stdout.write('Getting anonymous chat session… ');
  let token: string;
  try {
    token = await getChatSessionToken();
    console.log(`${GREEN}OK${RESET}`);
  } catch (e) {
    console.log(`${RED}FAILED${RESET}: ${e}`);
    process.exit(1);
  }

  // ── SCENARIO 1: Direct spicy pizza query ──────────────────────────────────
  console.log(`\n${BOLD}SCENARIO 1: Direct recommendation (spicy pizzas)${RESET}`);
  const s1 = await chatTurn([{ role: 'user', content: 'consigliami una pizza piccante' }], token);
  printTurn(s1);
  assert(!s1.error, 'no error');
  assert(s1.text.length > 10, 'has text response', `text was: "${s1.text}"`);
  assert(hasToolCall(s1, 'show_items'), 'called show_items');
  assert(!hasToolCall(s1, 'scroll_to_category'), 'did NOT call scroll_to_category');
  const ids1 = toolCallIds(s1, 'show_items');
  assert(ids1.length > 0, `show_items has item IDs (got ${ids1.length})`, `IDs: ${ids1.join(', ')}`);

  // ── SCENARIO 2: Undecided user → pick category → expect show_items ────────
  console.log(`\n${BOLD}SCENARIO 2: show_choices flow — picking category must NOT scroll${RESET}`);
  const s2a = await chatTurn([{ role: 'user', content: 'non so cosa prendere' }], token);
  printTurn(s2a);
  assert(!s2a.error, 'no error (turn 1)');
  assert(hasToolCall(s2a, 'show_choices'), 'called show_choices when undecided');

  // Pick "Pesce" — a specific single-category choice, not a broad sub-split one
  const s2b = await chatTurn([
    { role: 'user', content: 'non so cosa prendere' },
    { role: 'assistant', content: s2a.text || '[Showed choice options]' },
    { role: 'user', content: 'Pesce' },
  ], token);
  printTurn(s2b);
  assert(!s2b.error, 'no error (turn 2)');
  assert(s2b.text.length > 10, 'has text when user picks category', `text was: "${s2b.text}"`);
  assert(hasToolCall(s2b, 'show_items'), 'called show_items after category pick');
  assert(!hasToolCall(s2b, 'scroll_to_category'),
    'did NOT call scroll_to_category after show_choices pick',
    `got tools: ${s2b.toolCalls.map(t => t.name).join(', ')}`
  );

  // ── SCENARIO 3: Explicit navigation request ───────────────────────────────
  // navigate_to_category is now a single merged tool (scroll + choices)
  console.log(`\n${BOLD}SCENARIO 3: Explicit navigation → navigate_to_category + text${RESET}`);
  const s3 = await chatTurn([{ role: 'user', content: 'mostrami i secondi piatti' }], token);
  printTurn(s3);
  assert(!s3.error, 'no error');
  assert(s3.text.length > 5, 'has text confirmation');
  assert(hasToolCall(s3, 'navigate_to_category'), 'called navigate_to_category');
  const navCall = s3.toolCalls.find(t => t.name === 'navigate_to_category');
  assert(!!navCall?.params.category_id, 'navigate_to_category has category_id');
  assert(Array.isArray(navCall?.params.choices) && (navCall?.params.choices as string[]).length >= 2, 'navigate_to_category has choices array');

  // ── SCENARIO 4: Multi-turn — follow-up must show_items too ───────────────
  // Test that a direct recommendation follow-up produces text + show_items.
  // Keep both turns specific so the model recommends rather than asks questions.
  console.log(`\n${BOLD}SCENARIO 4: Multi-turn — follow-up must include show_items${RESET}`);
  const s4a = await chatTurn([{ role: 'user', content: 'consigliami una pizza piccante' }], token);
  printTurn(s4a);
  assert(!s4a.error, 'no error (turn 1)');
  assert(hasToolCall(s4a, 'show_items'), 'called show_items in turn 1');

  const s4b = await chatTurn([
    { role: 'user', content: 'consigliami una pizza piccante' },
    { role: 'assistant', content: s4a.text || '[Showed menu items]' },
    { role: 'user', content: 'hai una pizza meno piccante ma comunque saporita?' },
  ], token);
  printTurn(s4b);
  assert(!s4b.error, 'no error (turn 2)');
  assert(s4b.text.length > 10, 'has text in follow-up', `text was: "${s4b.text}"`);
  assert(hasToolCall(s4b, 'show_items'), 'called show_items in follow-up turn');

  // ── SCENARIO 5: English language response ────────────────────────────────
  // Note: if undecided, the model may return show_choices with no text (correct per rules).
  // We test a specific item request so a recommendation (text + show_items) is expected.
  console.log(`\n${BOLD}SCENARIO 5: English user direct request → English response + show_items${RESET}`);
  const s5 = await chatTurn([{ role: 'user', content: 'recommend me a pasta dish' }], token, 'it');
  printTurn(s5);
  assert(!s5.error, 'no error');
  assert(s5.text.length > 10, 'has text', `text was: "${s5.text}"`);
  assert(hasToolCall(s5, 'show_items'), 'called show_items');
  // Very loose language check — just verify no pure Italian
  const looksItalian = /\b(ecco|consiglio|ottimo|benvenuto)\b/i.test(s5.text);
  assert(!looksItalian, 'response does not look purely Italian (language detection)', `text: "${s5.text}"`);

  // ── SCENARIO 6: special pizza query returns text + show_items ────────────
  console.log(`\n${BOLD}SCENARIO 6: special pizza → text + show_items${RESET}`);
  const s6 = await chatTurn([{ role: 'user', content: 'qual è la vostra pizza più speciale?' }], token);
  printTurn(s6);
  assert(!s6.error, 'no error');
  assert(s6.text.length > 10, 'has text response', `text was: "${s6.text}"`);
  assert(hasToolCall(s6, 'show_items'), 'called show_items');
  const ids6 = toolCallIds(s6, 'show_items');
  assert(ids6.length > 0, `show_items has item IDs (got ${ids6.length})`);

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  const color = failed === 0 ? GREEN : RED;
  console.log(`\n${BOLD}Results: ${color}${passed}/${total} passed${RESET}${failed > 0 ? `, ${RED}${failed} failed${RESET}` : ''}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error(`${RED}Fatal:${RESET}`, e);
  process.exit(1);
});
