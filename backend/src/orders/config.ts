import { eq } from 'drizzle-orm';
import { normalizeModulesConfig } from '@menu/schemas';
import * as schema from '../db/schema';
import type { DbInstance } from '../db';

/** Loads the normalized ordering config; null when unpublished or missing. */
export async function loadOrdering(db: DbInstance) {
  const [settingsRow] = await db
    .select({
      modules: schema.settings.modules,
      aiChatEnabled: schema.settings.aiChatEnabled,
      aiVoiceEnabled: schema.settings.aiVoiceEnabled,
      publicationState: schema.settings.publicationState,
    })
    .from(schema.settings)
    .where(eq(schema.settings.id, 1))
    .limit(1);
  if (!settingsRow || settingsRow.publicationState !== 'published') return null;
  return normalizeModulesConfig(settingsRow.modules, settingsRow).ordering;
}
