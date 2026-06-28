'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useChatActionsStore } from '@/stores/chatActionsStore';
import type { SSETextEvent, SSEToolCallEvent, SSEErrorEvent } from '@/lib/chat-types';

const CHAT_WORKER_URL = process.env.NEXT_PUBLIC_CHAT_WORKER_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8787');
const SESSION_RETRY_MS = 1_000;
const SESSION_STORAGE_KEY = 'risto-chat-session';

interface StoredChatSession {
  token: string;
  expiresAt: number;
}

let pendingSession: Promise<string> | null = null;

function getStoredSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChatSession;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.token || !parsed.expiresAt || parsed.expiresAt <= now + 60) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

function storeSession(session: StoredChatSession) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures
  }
}

function clearStoredSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function createChatSession(): Promise<string> {
  if (!CHAT_WORKER_URL) throw new Error('Chat worker URL is not configured');
  while (true) {
    const response = await fetch(`${CHAT_WORKER_URL}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 1;
      await new Promise((resolve) => setTimeout(resolve, Math.max(SESSION_RETRY_MS, retryAfter * 1000)));
      continue;
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = await response.json() as StoredChatSession;
    if (!body.token || !body.expiresAt) throw new Error('Invalid chat session response');
    storeSession(body);
    return body.token;
  }
}

function ensureChatSession(): Promise<string> {
  const existing = getStoredSession();
  if (existing) return Promise.resolve(existing);

  if (pendingSession) return pendingSession;

  pendingSession = createChatSession().finally(() => { pendingSession = null; });
  return pendingSession;
}

export function useStreamingChat(locale: string) {
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!CHAT_WORKER_URL) return;
    void ensureChatSession().catch(() => {});
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!CHAT_WORKER_URL) {
      useChatStore.getState().appendToStream('Chat is not available right now.');
      return;
    }
    const store = useChatStore.getState();
    if (store.isStreaming) return;

    store.addUserMessage(content);

    const messages = useChatStore.getState().messages
      .map(m => {
        if (m.role === 'assistant' && !m.content.trim()) {
          if (m.showItemIds?.length) return { role: 'assistant' as const, content: `[Showed ${m.showItemIds.length} menu item card(s)]` };
          if (m.choices) return { role: 'assistant' as const, content: `[Showed choice options: ${m.choices.options.join(', ')}]` };
          return null;
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      })
      .filter((m): m is { role: 'user' | 'assistant'; content: string } => m !== null);

    store.startAssistantMessage();
    const myStreamId = useChatStore.getState().currentStreamId;

    abortRef.current = new AbortController();

    try {
      const chatBody = JSON.stringify({ messages, locale });
      const doFetch = (token: string) => fetch(`${CHAT_WORKER_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: chatBody,
        signal: abortRef.current!.signal,
      });

      let token = await ensureChatSession();
      let response = await doFetch(token);

      if (response.status === 401) {
        clearStoredSession();
        token = await ensureChatSession();
        response = await doFetch(token);
      }

      if (!response.ok) {
        useChatStore.getState().appendToStream('Non riesco a rispondere ora. Riprova tra poco.');
        useChatStore.getState().finishStream();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        useChatStore.getState().finishStream();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';
      let eventData = '';

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
              const parsed = JSON.parse(eventData);
              switch (eventType) {
                case 'text': {
                  const { text } = parsed as SSETextEvent;
                  useChatStore.getState().appendToStream(text);
                  break;
                }
                case 'tool_call': {
                  const toolCall = parsed as SSEToolCallEvent;
                  if (toolCall.name === 'show_items') {
                    useChatStore.getState().addShowItems((toolCall.params.item_ids as string[]) || []);
                  } else if (toolCall.name === 'show_choices') {
                    useChatStore.getState().addChoices({
                      prompt: (toolCall.params.prompt as string) || '',
                      options: (toolCall.params.choices as string[]) || [],
                      mode: (toolCall.params.mode as 'single' | 'multi') || 'single',
                    });
                  } else if (toolCall.name === 'navigate_to_category') {
                    useChatActionsStore.getState().requestScrollToCategory(toolCall.params.category_id as string);
                    useChatStore.getState().addChoices({
                      prompt: (toolCall.params.choices_prompt as string) || '',
                      options: (toolCall.params.choices as string[]) || [],
                      mode: 'single',
                    });
                  } else if (toolCall.name === 'filter_menu') {
                    useChatActionsStore.getState().setFilterCriteria({
                      excludeAllergens: toolCall.params.exclude_allergens as string[] | undefined,
                      searchQuery: toolCall.params.search_query as string | undefined,
                    });
                  } else if (toolCall.name === 'scroll_to_category') {
                    useChatActionsStore.getState().requestScrollToCategory(toolCall.params.category_id as string);
                  }
                  break;
                }
                case 'done': {
                  useChatStore.getState().finishStream();
                  break;
                }
                case 'error': {
                  const { message } = parsed as SSEErrorEvent;
                  useChatStore.getState().appendToStream(`Error: ${message}`);
                  useChatStore.getState().finishStream();
                  break;
                }
              }
            } catch {
              // Ignore malformed events
            }
            eventType = '';
            eventData = '';
          }
        }
      }

      if (useChatStore.getState().currentStreamId === myStreamId) {
        useChatStore.getState().finishStream();
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User cancelled
      } else if (useChatStore.getState().currentStreamId === myStreamId) {
        useChatStore.getState().appendToStream('Non riesco a rispondere ora. Riprova tra poco.');
        useChatStore.getState().finishStream();
      }
    } finally {
      abortRef.current = null;
    }
  }, [locale]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { sendMessage, cancel };
}
