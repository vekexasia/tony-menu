import { z } from 'zod';
import { I18nMapSchema } from './common.js';
import { MenuIconSchema, HHMMSchema, LabelColorSchema, WeekdaySchema } from './catalog.js';
import { RestaurantInfoSchema, RestaurantSocialsSchema, PromotionAlertSchema, OpeningScheduleSchema, RestaurantThemeSchema } from './restaurant.js';

// ── Restaurant Settings ─────────────────────────────────────────────

export const UpdateSettingsBodySchema = z.object({
  name: z.string().optional(),
  payoff: z.string().optional(),
  theme: RestaurantThemeSchema.optional(),
  info: RestaurantInfoSchema.optional(),
  socials: RestaurantSocialsSchema.optional(),
  promotionAlert: PromotionAlertSchema.optional(),
  chatAgentPrompt: z.string().optional(),
  aiChatEnabled: z.boolean().optional(),
  aiVoiceEnabled: z.boolean().optional(),
  selectionEnabled: z.boolean().optional(),
  primaryLocale: z.string().min(2).max(10).regex(/^[a-z0-9-]+$/).optional(),
  enabledLocales: z.array(z.string()).nullable().optional(),
  disabledLocales: z.array(z.string()).nullable().optional(),
  customLocales: z.array(z.object({ code: z.string().min(2).max(10).regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(50), flagUrl: z.string().url().nullable().optional() })).nullable().optional(),
});
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

export const UpdateHoursBodySchema = z.object({
  openingSchedule: OpeningScheduleSchema,
});
export type UpdateHoursBody = z.infer<typeof UpdateHoursBodySchema>;

// ── Categories ──────────────────────────────────────────────────────

export const UpdateCategoryBodySchema = z.object({
  name: z.string().optional(),
  i18n: I18nMapSchema.optional(),
});
export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBodySchema>;

export const ReorderItemsBodySchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    order: z.number(),
  })),
});
export type ReorderItemsBody = z.infer<typeof ReorderItemsBodySchema>;

// ── Menu Entries ────────────────────────────────────────────────────

export const CreateEntryBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  price: z.number(),
  order: z.number().optional(),
  outOfStock: z.boolean().optional(),
  frozen: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
  priceUnit: z.string().optional(),
  i18n: I18nMapSchema.optional(),
  menuIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
});
export type CreateEntryBody = z.infer<typeof CreateEntryBodySchema>;

export const UpdateEntryBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().optional(),
  outOfStock: z.boolean().optional(),
  frozen: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
  priceUnit: z.string().optional(),
  i18n: I18nMapSchema.optional(),
  menuIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
});
export type UpdateEntryBody = z.infer<typeof UpdateEntryBodySchema>;

export const MoveEntryBodySchema = z.object({
  targetCategoryId: z.string(),
});
export type MoveEntryBody = z.infer<typeof MoveEntryBodySchema>;

// ── Menus ───────────────────────────────────────────────────────────

export const CreateMenuBodySchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens only'),
  title: z.string().trim().min(1).max(120),
  i18n: I18nMapSchema.optional(),
  icon: MenuIconSchema.optional(),
});
export type CreateMenuBody = z.infer<typeof CreateMenuBodySchema>;

export const UpdateMenuBodySchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  i18n: I18nMapSchema.optional(),
  published: z.boolean().optional(),
  icon: MenuIconSchema.optional(),
  availableFrom: HHMMSchema.nullable().optional(),
  availableTo: HHMMSchema.nullable().optional(),
  availableDays: z.array(WeekdaySchema).min(1).max(7).nullable().optional()
    .refine((d) => d == null || new Set(d).size === d.length, { message: 'availableDays must not contain duplicates' }),
}).refine(
  (d) => {
    const hasFrom = d.availableFrom != null;
    const hasTo = d.availableTo != null;
    return hasFrom === hasTo;
  },
  { message: 'availableFrom and availableTo must both be set or both be null' },
);
export type UpdateMenuBody = z.infer<typeof UpdateMenuBodySchema>;

// ── Restaurants ─────────────────────────────────────────────────────

export const CreateRestaurantBodySchema = z.object({
  name: z.string().trim().min(1),
  cuisineType: z.string().optional(),
});
export type CreateRestaurantBody = z.infer<typeof CreateRestaurantBodySchema>;

export const SetPublishedBodySchema = z.object({
  published: z.boolean(),
});
export type SetPublishedBody = z.infer<typeof SetPublishedBodySchema>;

// ── Translate ───────────────────────────────────────────────────────

export const TranslateRequestBodySchema = z.object({
  sourceText: z.string().min(1).max(2000),
  targetLocale: z.string().min(2).max(10).regex(/^[a-z0-9-]+$/),
  field: z.enum(['name', 'desc', 'text']),
});
export type TranslateRequestBody = z.infer<typeof TranslateRequestBodySchema>;

// ── Labels ──────────────────────────────────────────────────────────

export const CreateLabelBodySchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: LabelColorSchema.default('primary'),
  i18n: I18nMapSchema.optional(),
});
export type CreateLabelBody = z.infer<typeof CreateLabelBodySchema>;

export const UpdateLabelBodySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: LabelColorSchema.optional(),
  i18n: I18nMapSchema.optional(),
});
export type UpdateLabelBody = z.infer<typeof UpdateLabelBodySchema>;

// ── Catalog View ────────────────────────────────────────────────────

export const RecordViewBodySchema = z.object({
  entryId: z.string().min(1),
});
export type RecordViewBody = z.infer<typeof RecordViewBodySchema>;
