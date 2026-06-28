import type { ChatMessage, ToolDefinition, ChatToolCall, Env } from '../types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { toJsonSchemaParams } from './tools';
import { MAX_OUTPUT_TOKENS } from './limits';

// ponytail: NOTE the tool-call loop is triplicated across openai.ts, anthropic.ts and
// here. Deduping into one provider-neutral loop is a larger refactor; for now only the
// max-tokens cap is shared (limits.ts) so allergen lists truncate identically.

export interface LLMProvider {
  chat(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onText: (text: string) => void;
    onToolCall: (call: ChatToolCall) => void;
    /** Resolves server-side tools. Returns JSON string result, or null for client-side tools. */
    resolveServerTool?: (call: ChatToolCall) => string | null;
  }): Promise<void>;
}

type WorkersAIToolCall = {
  name?: string;
  arguments?: Record<string, unknown> | string;
};

type WorkersAIResult = {
  response?: string;
  tool_calls?: WorkersAIToolCall[];
};

function toWorkersAITools(tools: ToolDefinition[]) {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: toJsonSchemaParams(t.parameters),
  }));
}

export function parseWorkersAIToolCall(call: WorkersAIToolCall): ChatToolCall | null {
  if (!call.name) return null;

  let params: Record<string, unknown> = {};
  if (typeof call.arguments === 'string') {
    try {
      params = JSON.parse(call.arguments) as Record<string, unknown>;
    } catch (e) {
      console.warn('[WorkersAI] tool arguments JSON parse failed:', e);
      params = {};
    }
  } else if (call.arguments && typeof call.arguments === 'object') {
    params = call.arguments;
  }

  return { name: call.name, params };
}

export function normalizeToolParams(name: string, params: unknown): Record<string, unknown> {
  if (name === 'show_items' && Array.isArray(params)) return { item_ids: params };
  return params && typeof params === 'object' && !Array.isArray(params) ? params as Record<string, unknown> : {};
}

export function extractTextToolCalls(text: string): { text: string; calls: ChatToolCall[] } {
  const calls: ChatToolCall[] = [];
  let cleaned = text;

  cleaned = cleaned.replace(/\{\s*"type"\s*:\s*"function"\s*,\s*"name"\s*:\s*"([^"]+)"\s*,\s*"parameters"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\s*\}/g, (match, name: string, rawParams: string) => {
    try {
      calls.push({ name, params: normalizeToolParams(name, JSON.parse(rawParams) as unknown) });
      return '';
    } catch (e) {
      console.warn('[WorkersAI] inline tool-call JSON parse failed:', e);
      return match;
    }
  });

  cleaned = cleaned.replace(/\b(show_items|show_choices|navigate_to_category|filter_menu)\((\{[^)]*\}|\[[^)]*\])\)/g, (match, name: string, rawParams: string) => {
    try {
      calls.push({ name, params: normalizeToolParams(name, JSON.parse(rawParams) as unknown) });
      return '';
    } catch (e) {
      console.warn('[WorkersAI] inline tool-call JSON parse failed:', e);
      return match;
    }
  });

  return { text: cleaned.trim(), calls };
}

// Neutralize user-supplied content before it is flattened into the "User:/Assistant:"
// transcript. WorkersAI has no structured message API here, so a user message containing
// role prefixes or tool-call syntax could otherwise spoof an assistant turn or a tool call
// (the regex extractor in extractTextToolCalls parses those back out). We escape the
// role-prefix and tool-call patterns so they survive as literal text and cannot be reparsed.
export function sanitizeUserContent(content: string): string {
  return content
    .replace(/^(\s*)(User|Assistant)(\s*):/gim, '$1$2$3\u200b:')
    .replace(/\b(show_items|show_choices|navigate_to_category|filter_menu)\s*\(/gi, '$1\u200b(')
    .replace(/"type"\s*:\s*"function"/gi, '"type\u200b":"function"');
}

export function toPrompt(systemPrompt: string, messages: ChatMessage[]): string {
  const conversation = messages
    .map(m => m.role === 'user'
      ? `User: ${sanitizeUserContent(m.content)}`
      : `Assistant: ${m.content}`)
    .join('\n');

  return `${systemPrompt}\n\n## Conversation\n\n${conversation}\n\nAssistant:`;
}

class WorkersAIProvider implements LLMProvider {
  constructor(private ai: Ai, private model: string) {}

  async chat(params: Parameters<LLMProvider['chat']>[0]): Promise<void> {
    let messages: ChatMessage[] = params.messages;

    for (let iteration = 0; iteration < 5; iteration++) {
      const result = await this.ai.run(this.model as keyof AiModels, {
        prompt: toPrompt(params.systemPrompt, messages),
        tools: toWorkersAITools(params.tools),
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      }) as WorkersAIResult;

      const rawText = typeof result.response === 'string' ? result.response : '';
      const extracted = extractTextToolCalls(rawText);
      const toolCalls = (result.tool_calls || [])
        .map(parseWorkersAIToolCall)
        .filter((call): call is ChatToolCall => call !== null)
        .concat(extracted.calls);

      console.log(`[WorkersAI] iter=${iteration} content=${!!extracted.text} tools=${toolCalls.length}`);

      if (extracted.text) params.onText(extracted.text);
      if (toolCalls.length === 0) break;

      const serverResults: string[] = [];
      for (const call of toolCalls) {
        const serverResult = params.resolveServerTool?.(call);
        if (serverResult === null || serverResult === undefined) {
          params.onToolCall(call);
        } else {
          serverResults.push(`${call.name}: ${serverResult}`);
        }
      }

      if (serverResults.length === 0) break;

      messages = [
        ...messages,
        { role: 'assistant', content: extracted.text || 'I need to check the menu details.' },
        {
          role: 'user',
          content: `Tool results:\n${serverResults.join('\n')}\n\nUse these results to answer the user in natural language.`,
        },
      ];
    }
  }
}

export function createProvider(env: Env): LLMProvider {
  const providerName = (env.LLM_PROVIDER || 'anthropic').toLowerCase();

  if (providerName === 'workers-ai') {
    if (!env.AI) throw new Error('Workers AI binding is not configured');
    return new WorkersAIProvider(env.AI, env.LLM_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  }

  if (providerName === 'openai') {
    return new OpenAIProvider(env.OPENAI_API_KEY, env.LLM_MODEL || 'gpt-5.4-mini');
  }

  return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL || 'claude-haiku-4-5-20251001');
}
