import type { Env, ChatRequest, ChatToolCall, MenuDataCache } from '../types';
import { getMenuData } from '../menu/cache';
import { buildSystemPrompt } from './system-prompt';
import { TOOLS } from './tools';
import { createProvider } from './provider';
import { encodeTextEvent, encodeToolCallEvent, encodeDoneEvent, encodeErrorEvent, sseHeaders } from './stream';
import { getItemDetail, searchByAllergens } from '../menu/serialize';
import { checkMenuForChat } from '../middleware/menu-guard';
import { checkIpRateLimit, checkSessionRateLimit } from '../middleware/rate-limit';
import { consumeDailyAiRequest } from '../middleware/daily-cap';
import type { ChatSession } from '../middleware/session';
import { detectChatLocaleFromMessages, languageNameForLocale } from './locale';

const MAX_MESSAGES = 20;

function summarizeTextForLog(text: string): string {
  return `${text.length} chars`;
}

function summarizeToolsForLog(toolCalls: string[]): string {
  return toolCalls.map(tc => tc.split('(')[0]).join(', ');
}

export async function handleChat(request: Request, env: Env, corsHeaders: Record<string, string>, session: ChatSession, ctx: ExecutionContext): Promise<Response> {
  const startTime = Date.now();
  const sessionId = crypto.randomUUID();
  const ip = request.headers.get('cf-connecting-ip') || 'local';

  let body: ChatRequest;
  try {
    body = await request.json() as ChatRequest;
  } catch {
    console.log(`[CHAT] ${ip} | BAD REQUEST: invalid JSON`);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { messages, locale = 'en' } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    console.log(`[CHAT] ${ip} | BAD REQUEST: no messages`);
    return new Response(JSON.stringify({ error: 'messages is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const ipLimitResp = checkIpRateLimit(ip);
  if (ipLimitResp) {
    return new Response(ipLimitResp.body, {
      status: ipLimitResp.status,
      headers: { ...Object.fromEntries(ipLimitResp.headers.entries()), ...corsHeaders },
    });
  }

  const sessionLimitResp = checkSessionRateLimit(session.sid);
  if (sessionLimitResp) {
    return new Response(sessionLimitResp.body, {
      status: sessionLimitResp.status,
      headers: { ...Object.fromEntries(sessionLimitResp.headers.entries()), ...corsHeaders },
    });
  }

  // Menu guard: ensure menu is published and chat is enabled
  const guardResult = await checkMenuForChat(env.DB);
  if (guardResult === 'draft') {
    console.log(`[CHAT] ${ip} | BLOCKED: menu draft`);
    return new Response(JSON.stringify({ error: 'Menu not available' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
  if (guardResult === 'chat_disabled') {
    console.log(`[CHAT] ${ip} | BLOCKED: chat disabled`);
    return new Response(JSON.stringify({ error: 'Chat not available' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const dailyCap = await consumeDailyAiRequest(env);
  if (!dailyCap.allowed) {
    console.log(`[CHAT] ${ip} | BLOCKED: daily AI request cap reached (${dailyCap.used}/${dailyCap.limit})`);
    return new Response(
      `${encodeTextEvent('The chat assistant has reached its daily request limit. Please try again tomorrow.')}\n${encodeDoneEvent()}`,
      { headers: { ...sseHeaders(), ...corsHeaders } },
    );
  }

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';

  // Limit message history
  const trimmedMessages = messages.slice(-MAX_MESSAGES);

  const chatLocale = detectChatLocaleFromMessages(trimmedMessages, locale);
  const userLang = languageNameForLocale(chatLocale);
  console.log(`[CHAT] ${ip} | sid=${session.sid.slice(0, 8)}… | locale=${locale} | chatLocale=${chatLocale} | lang=${userLang} | msgs=${messages.length} | user=${summarizeTextForLog(lastUserMsg)}`);

  // Load menu data (from in-memory cache, KV, or D1)
  let menuData;
  try {
    const menuStart = Date.now();
    menuData = await getMenuData(env);
    console.log(`[CHAT] ${ip} | menu loaded in ${Date.now() - menuStart}ms`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load menu';
    console.error(`[CHAT] ${ip} | MENU ERROR: ${msg}`);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }


  const systemPrompt = buildSystemPrompt(menuData, chatLocale, userLang);
  console.log(`[CHAT] ${ip} | system prompt: ${systemPrompt.length} chars, ~${Math.ceil(systemPrompt.length / 4)} tokens`);
  const provider = createProvider(env);

  // Server-side tool resolver
  const resolveServerTool = createServerToolResolver(menuData, chatLocale);

  // Create a streaming response using TransformStream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Collect response for logging and session persistence
  const logParts: string[] = [];
  const toolCalls: string[] = [];

  // Run LLM call in background
  const llmPromise = (async () => {
    let success = false;
    try {
      const llmStart = Date.now();
      await provider.chat({
        systemPrompt,
        messages: trimmedMessages,
        tools: TOOLS,
        onText: (text: string) => {
          logParts.push(text);
          writer.write(encoder.encode(encodeTextEvent(text)));
        },
        onToolCall: (call: ChatToolCall) => {
          toolCalls.push(`${call.name}(${JSON.stringify(call.params)})`);
          writer.write(encoder.encode(encodeToolCallEvent(call)));
        },
        resolveServerTool,
      });

      writer.write(encoder.encode(encodeDoneEvent()));
      success = true;

      const totalMs = Date.now() - startTime;
      const llmMs = Date.now() - llmStart;
      const responseText = logParts.join('');
      console.log(`[CHAT] ${ip} | DONE in ${totalMs}ms (llm=${llmMs}ms) | tools=[${summarizeToolsForLog(toolCalls)}] | response=${summarizeTextForLog(responseText)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'LLM error';
      console.error(`[CHAT] ${ip} | LLM ERROR: ${msg}`);
      writer.write(encoder.encode(encodeErrorEvent(msg)));
    } finally {
      writer.close();

      // Persist session — fire-and-forget, never blocks the stream.
      // Only save completed sessions (skip LLM errors — partial data isn't useful).
      if (success && env.DB) {
        const assistantContent = logParts.join('');
        const allMessages = [
          ...trimmedMessages,
          ...(assistantContent ? [{ role: 'assistant' as const, content: assistantContent }] : []),
        ];
        const toolCallNames = [...new Set(toolCalls.map(tc => tc.split('(')[0]))];
        ctx.waitUntil(
          env.DB.prepare(
            `INSERT INTO chat_sessions (id, uid, messages, locale, tool_calls, duration_ms, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
            .bind(
              sessionId,
              session.sid,
              JSON.stringify(allMessages),
              locale,
              JSON.stringify(toolCallNames),
              Date.now() - startTime,
              Date.now(),
            )
            .run()
            .catch(err => console.error('[CHAT] session save failed:', err)),
        );
      }
    }
  })();

  // Don't let the worker exit until the stream is done
  void llmPromise;

  return new Response(readable, {
    headers: { ...sseHeaders(), ...corsHeaders },
  });
}


function createServerToolResolver(menuData: MenuDataCache, locale: string) {
  return (call: ChatToolCall): string | null => {
    if (call.name === 'get_item_detail') {
      const itemId = call.params.item_id as string;
      const detail = getItemDetail(menuData, itemId, locale);
      return detail ? JSON.stringify(detail) : JSON.stringify({ error: 'Item not found' });
    }
    if (call.name === 'search_by_allergens') {
      const exclude = call.params.exclude_allergens as string[];
      const results = searchByAllergens(menuData, exclude, locale);
      return JSON.stringify({ count: results.length, items: results });
    }
    return null; // client-side tool
  };
}
