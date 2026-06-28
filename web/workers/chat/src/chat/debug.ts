import type { Env, ChatRequest } from '../types';
import { getMenuData } from '../menu/cache';
import { buildSystemPrompt } from './system-prompt';
import { TOOLS, toJsonSchemaParams } from './tools';
import { languageNameForLocale } from './locale';

/**
 * Debug endpoint: returns the full context that would be sent to the LLM.
 * POST /chat/debug with same body as /chat
 */
export async function handleChatDebug(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: ChatRequest;
  try {
    body = await request.json() as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { messages = [], locale = 'en' } = body;

  const menuData = await getMenuData(env);
  const userLang = languageNameForLocale(locale);
  const systemPrompt = buildSystemPrompt(menuData, locale, userLang);

  // Build the exact messages array sent to OpenAI
  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
  ];

  // Build the exact tools array
  const tools = TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: toJsonSchemaParams(t.parameters),
    },
  }));

  const context = {
    model: env.LLM_MODEL || 'gpt-5.4-mini',
    max_completion_tokens: 2048,
    tool_choice: 'auto',
    messages: llmMessages,
    tools,
  };

  return new Response(JSON.stringify(context, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
