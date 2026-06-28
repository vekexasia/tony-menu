import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatToolCall } from '../types';

// Mock the Anthropic SDK: client.messages.create returns a queued async-iterable stream.
const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import { AnthropicProvider } from './anthropic';
import { TOOLS } from './tools';

function streamOf(events: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
  };
}

beforeEach(() => createMock.mockReset());

describe('AnthropicProvider chat loop', () => {
  it('accumulates text deltas and stops on end_turn', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ]));
    const texts: string[] = [];
    const provider = new AnthropicProvider('key', 'model');
    await provider.chat({
      systemPrompt: 'SYS',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
      onText: t => texts.push(t),
      onToolCall: () => { throw new Error('no tool calls expected'); },
    });
    expect(texts.join('')).toBe('Hello world');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('accumulates a tool_use block and emits a client-side tool call', async () => {
    createMock.mockResolvedValueOnce(streamOf([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'show_items' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"item_ids":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '["a"]}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]));
    const toolCalls: ChatToolCall[] = [];
    const provider = new AnthropicProvider('key', 'model');
    await provider.chat({
      systemPrompt: 'SYS',
      messages: [{ role: 'user', content: 'recommend' }],
      tools: TOOLS,
      onText: () => {},
      onToolCall: c => toolCalls.push(c),
      resolveServerTool: () => null,
    });
    expect(toolCalls).toEqual([{ name: 'show_items', params: { item_ids: ['a'] } }]);
    // client-only tool -> no follow-up round-trip
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('feeds a server-side tool result back for a second round-trip', async () => {
    createMock
      .mockResolvedValueOnce(streamOf([
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'get_item_detail' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"item_id":"x"}' } },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ]))
      .mockResolvedValueOnce(streamOf([
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'It has gluten.' } },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      ]));
    const texts: string[] = [];
    const toolCalls: ChatToolCall[] = [];
    const resolveServerTool = vi.fn((call: ChatToolCall) =>
      call.name === 'get_item_detail' ? JSON.stringify({ allergens: ['Gluten'] }) : null,
    );
    const provider = new AnthropicProvider('key', 'model');
    await provider.chat({
      systemPrompt: 'SYS',
      messages: [{ role: 'user', content: 'about x' }],
      tools: TOOLS,
      onText: t => texts.push(t),
      onToolCall: c => toolCalls.push(c),
      resolveServerTool,
    });
    expect(resolveServerTool).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(toolCalls).toEqual([]); // server-side tool not surfaced to browser
    expect(texts.join('')).toContain('gluten');
  });
});
