import { z } from 'zod';

// ── i18n ────────────────────────────────────────────────────────────

export const I18nMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
