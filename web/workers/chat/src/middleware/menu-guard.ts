import type { D1DatabaseLike } from '../types';

export type MenuGuardResult = 'ok' | 'draft' | 'chat_disabled';

/**
 * Verify the menu is published and has AI chat enabled before making any LLM call.
 * Direct D1 query — bypasses menu cache intentionally so disabling chat takes
 * effect immediately.
 */

export async function checkMenuForChat(db: D1DatabaseLike): Promise<MenuGuardResult> {
  const row = await db
    .prepare('SELECT publication_state, ai_chat_enabled FROM settings WHERE id = 1')
    .first<{ publication_state: string; ai_chat_enabled: number }>();

  if (!row) return 'draft';
  if (row.publication_state !== 'published') return 'draft';
  if (!row.ai_chat_enabled) return 'chat_disabled';
  return 'ok';
}
