export interface Env {
  MENU_CACHE: KVNamespace;
  DB: D1Database;
  CHAT_SESSION_SECRET: string;
  LLM_PROVIDER: string;
  LLM_MODEL: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  REFRESH_SECRET: string;
  DAILY_AI_REQUEST_LIMIT?: string;
  AI?: Ai;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  locale?: string;
}

export interface RefreshRequest {
  secret: string;
}

export interface ChatToolCall {
  name: string;
  params: Record<string, unknown>;
}

// SSE event types sent to the client
export type SSEEventType = 'text' | 'tool_call' | 'done' | 'error';

export interface SSEEvent {
  type: SSEEventType;
  data: string | ChatToolCall;
}

// Provider-neutral tool definition
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  /** Server-side tools are resolved by the worker (not sent to the client). */
  serverSide?: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'string[]';
  description: string;
  required: boolean;
}

// Menu data types (mirrors the client types for serialization)
export interface MenuDataCache {
  restaurant: CachedRestaurant;
  categories: CachedCategory[];
  variants: CachedVariant[];
  extras: CachedExtra[];
  labels?: CachedLabel[];
  chatAgentPrompt?: string;
}

export interface CachedRestaurant {
  name: string;
  payoff?: string;
}

export interface CachedCategory {
  id: string;
  name: string;
  order: number;
  entries: CachedEntry[];
  variantPaths: string[];
  extraPaths: string[];
  i18n?: Record<string, Record<string, string>>;
}

export interface CachedEntry {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  priceUnit?: string;
  outOfStock: boolean;
  containsFrozenIngredient: boolean;
  allergens: string[];
  menuVisibility: string[];
  labelIds?: string[];
  overriddenVariantPaths?: string[];
  overriddenExtraPaths?: string[];
  i18n?: Record<string, Record<string, string>>;
}

export type CachedLabelColor = 'primary' | 'green' | 'amber' | 'red' | 'gray';

export interface CachedLabel {
  id: string;
  name: string;
  color: CachedLabelColor;
  sortOrder: number;
  i18n?: Record<string, Record<string, string>>;
}

export interface CachedVariant {
  id: string;
  path: string;
  name: string;
  description?: string;
  selections: { name: string; price: number; isDefault: boolean; i18n?: Record<string, Record<string, string>> }[];
  i18n?: Record<string, Record<string, string>>;
}

export interface CachedExtra {
  id: string;
  path: string;
  name: string;
  max: number;
  type: string;
  extras: { name: string; price: number; desc?: string; i18n?: Record<string, Record<string, string>> }[];
  i18n?: Record<string, Record<string, string>>;
}
