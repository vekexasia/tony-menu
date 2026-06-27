import OpenAI from 'openai';
import type { LLMProvider } from './provider';
import type { ChatMessage, ToolDefinition, ChatToolCall } from '../types';
import { toJsonSchemaParams } from './tools';

function toOpenAITools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: toJsonSchemaParams(t.parameters),
    },
  }));
}

function toOpenAIMessages(
  systemPrompt: string,
  messages: ChatMessage[]
): OpenAI.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    onText: (text: string) => void;
    onToolCall: (call: ChatToolCall) => void;
    resolveServerTool?: (call: ChatToolCall) => string | null;
  }): Promise<void> {
    const openaiTools = toOpenAITools(params.tools);
    let messages = toOpenAIMessages(params.systemPrompt, params.messages);

    // Tool-call loop: max 5 iterations (server-side tools need extra round-trips)
    for (let iteration = 0; iteration < 5; iteration++) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 4096,
        messages,
        tools: openaiTools,
        tool_choice: 'auto',
        stream: true,
        stream_options: { include_usage: true },
      });

      // Accumulate streamed content
      let textContent = '';
      // tool index → accumulated {id, name, arguments}
      const toolCallsAcc = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason: string | null = null;
      let usage: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number } = {};

      for await (const chunk of stream) {
        // Final chunk carries usage (no choices)
        if (chunk.usage) {
          const u = chunk.usage;
          usage = {
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            cached_tokens: (u.prompt_tokens_details as { cached_tokens?: number } | undefined)?.cached_tokens ?? 0,
          };
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Emit text deltas immediately so the browser sees tokens as they arrive
        if (delta.content) {
          textContent += delta.content;
          params.onText(delta.content);
        }

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!toolCallsAcc.has(tc.index)) {
              toolCallsAcc.set(tc.index, { id: '', name: '', arguments: '' });
            }
            const acc = toolCallsAcc.get(tc.index)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }

      const cacheHit = (usage.cached_tokens ?? 0) > 0;
      console.log(
        `[OpenAI] iter=${iteration} finish=${finishReason} content=${!!textContent} tools=${toolCallsAcc.size}` +
        ` | tokens: prompt=${usage.prompt_tokens} compl=${usage.completion_tokens}` +
        ` cached=${usage.cached_tokens} (${cacheHit ? '✓ HIT' : '✗ MISS'})`,
      );

      if (toolCallsAcc.size === 0) break;

      // Reconstruct the assistant message for the next iteration
      const toolCallsList = Array.from(toolCallsAcc.entries())
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));

      const assistantMsg: OpenAI.ChatCompletionMessageParam = {
        role: 'assistant',
        content: textContent || null,
        tool_calls: toolCallsList,
      };

      // Process tool calls
      const toolResultMessages: OpenAI.ChatCompletionToolMessageParam[] = [];
      let hasServerSideTool = false;

      for (const tc of toolCallsList) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          // ignore parse errors
        }
        const toolCall: ChatToolCall = {
          name: tc.function.name,
          params: parsedArgs,
        };

        const serverResult = params.resolveServerTool?.(toolCall);
        if (serverResult !== null && serverResult !== undefined) {
          // Server-side: feed result back to LLM
          hasServerSideTool = true;
          console.log(`[OpenAI] server-side tool: ${tc.function.name}`);
          toolResultMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: serverResult,
          });
        } else {
          // Client-side: emit to browser
          params.onToolCall(toolCall);
          toolResultMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ status: 'displayed' }),
          });
        }
      }

      if (finishReason !== 'tool_calls') break;

      // Client-side tools are display-only — no LLM round-trip needed.
      if (!hasServerSideTool) break;

      // Continue conversation with server-side tool results
      messages = [
        ...messages,
        assistantMsg,
        ...toolResultMessages,
      ];
    }
  }
}
