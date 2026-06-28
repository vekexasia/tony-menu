import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './provider';
import type { ChatMessage, ToolDefinition, ChatToolCall } from '../types';
import { toJsonSchemaParams } from './tools';
import { MAX_OUTPUT_TOKENS } from './limits';

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: toJsonSchemaParams(t.parameters) as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({
      apiKey,
      // Enable prompt caching — dramatically reduces TTFT on repeat requests.
      defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
    });
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
    const anthropicTools = toAnthropicTools(params.tools);
    let messages = toAnthropicMessages(params.messages);

    // Mark the system prompt as cacheable. The menu is static per restaurant, so
    // subsequent requests skip full re-processing and get much lower TTFT.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const system: any = [{ type: 'text', text: params.systemPrompt, cache_control: { type: 'ephemeral' } }];

    for (let iteration = 0; iteration < 5; iteration++) {
      // Streaming: emit text tokens as they arrive, accumulate tool calls.
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages,
        tools: anthropicTools,
        tool_choice: { type: 'auto' },
        stream: true,
      });

      let stopReason: string | null = null;
      let textContent = '';
      // index → {id, name, input} — tool call deltas come in pieces
      const toolCallsAcc = new Map<number, { id: string; name: string; input: string }>();

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolCallsAcc.set(event.index, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            textContent += event.delta.text;
            params.onText(event.delta.text);
          } else if (event.delta.type === 'input_json_delta') {
            const tc = toolCallsAcc.get(event.index);
            if (tc) tc.input += event.delta.partial_json;
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta.stop_reason ?? null;
        }
      }

      console.log(`[Anthropic] iter=${iteration} stop=${stopReason} content=${!!textContent} tools=${toolCallsAcc.size}`);

      const toolCalls = Array.from(toolCallsAcc.values()).map(tc => {
        let parsedInput: Record<string, unknown> = {};
        try { parsedInput = JSON.parse(tc.input || '{}'); } catch (e) { console.warn('[Anthropic] tool input JSON parse failed:', e); }
        return { id: tc.id, name: tc.name, parsedInput };
      });

      if (toolCalls.length === 0) break;

      // Reconstruct assistant content for the follow-up turn
      const assistantContent: Anthropic.MessageParam['content'] = [];
      if (textContent) assistantContent.push({ type: 'text', text: textContent });
      for (const tc of toolCalls) {
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.parsedInput,
        });
      }

      // Emit client-side tool calls to the browser
      for (const tc of toolCalls) {
        const toolCall: ChatToolCall = { name: tc.name, params: tc.parsedInput };
        const serverResult = params.resolveServerTool?.(toolCall);
        if (serverResult === null || serverResult === undefined) {
          params.onToolCall(toolCall);
        } else {
          console.log(`[Anthropic] server-side tool: ${tc.name}`);
        }
      }

      if (stopReason !== 'tool_use') break;

      const hasServerSideTool = toolCalls.some(tc => {
        const r = params.resolveServerTool?.({ name: tc.name, params: tc.parsedInput });
        return r !== null && r !== undefined;
      });
      if (!hasServerSideTool) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = toolCalls.map(tc => {
        const serverResult = params.resolveServerTool?.({ name: tc.name, params: tc.parsedInput });
        return {
          type: 'tool_result' as const,
          tool_use_id: tc.id,
          content: serverResult ?? JSON.stringify({ status: 'displayed' }),
        };
      });

      messages = [
        ...messages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResults },
      ];
    }
  }
}
