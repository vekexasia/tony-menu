import { z } from 'zod';
import { I18nMapSchema } from './common.js';

export const VariantSelectionSchema = z.object({
  name: z.string(),
  desc: z.string().optional(),
  price: z.number(),
  isDefault: z.boolean(),
  i18n: I18nMapSchema.optional(),
});

export const ExtraOptionSchema = z.object({
  name: z.string(),
  internalCode: z.string().optional(),
  desc: z.string().optional(),
  price: z.number(),
  i18n: I18nMapSchema.optional(),
});
