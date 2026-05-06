import { z } from 'zod';
import { I18nMapSchema } from './common.js';
import { RestaurantThemeSchema, RestaurantInfoSchema, RestaurantSocialsSchema, OpeningScheduleSchema } from './restaurant.js';
import { VariantSelectionSchema, ExtraOptionSchema } from './menu.js';

export const LABEL_COLORS = ['primary', 'green', 'amber', 'red', 'gray'] as const;
export const LabelColorSchema = z.enum(LABEL_COLORS);
export type LabelColor = z.infer<typeof LabelColorSchema>;

export const CatalogLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: LabelColorSchema,
  sortOrder: z.number(),
  i18n: I18nMapSchema.nullable(),
});
export type CatalogLabel = z.infer<typeof CatalogLabelSchema>;

export const CatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  priceUnit: z.string().nullable(),
  imageUrl: z.string().nullable(),
  outOfStock: z.boolean(),
  frozen: z.boolean(),
  sortOrder: z.number(),
  hidden: z.boolean(),
  menuIds: z.array(z.string()),
  labelIds: z.array(z.string()),
  allergens: z.array(z.string()).nullable(),
  i18n: I18nMapSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const CatalogCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  i18n: I18nMapSchema.nullable(),
  entries: z.array(CatalogEntrySchema),
});
export type CatalogCategory = z.infer<typeof CatalogCategorySchema>;

/**
 * Curated set of standard icons that the home page renders inline as SVG.
 * Stored as a string to allow forward-compat with future additions without a
 * schema rev. Keep in sync with the `<MenuIcon>` component on the web side.
 */
export const MENU_ICONS = [
  'utensils',
  'lunch',
  'dinner',
  'breakfast',
  'wine',
  'beer',
  'cocktail',
  'coffee',
  'pizza',
  'burger',
  'dessert',
  'salad',
  'fish',
  'bread',
] as const;
export const MenuIconSchema = z.enum(MENU_ICONS);
export type MenuIcon = z.infer<typeof MenuIconSchema>;

export const HHMM_RE = /^\d{2}:\d{2}$/;
export const HHMMSchema = z.string().regex(HHMM_RE, 'must be HH:MM');

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const WeekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof WeekdaySchema>;

export const CatalogMenuSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  i18n: I18nMapSchema.nullable(),
  published: z.boolean(),
  sortOrder: z.number(),
  icon: z.string(),
  availableFrom: HHMMSchema.nullable().optional(),
  availableTo: HHMMSchema.nullable().optional(),
  availableDays: z.array(WeekdaySchema).nullable().optional(),
});
export type CatalogMenu = z.infer<typeof CatalogMenuSchema>;

export const CatalogVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number(),
  selections: z.array(VariantSelectionSchema).nullable(),
  i18n: I18nMapSchema.nullable(),
});
export type CatalogVariant = z.infer<typeof CatalogVariantSchema>;

export const CatalogExtraSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  max: z.number(),
  options: z.array(ExtraOptionSchema).nullable(),
  i18n: I18nMapSchema.nullable(),
});
export type CatalogExtra = z.infer<typeof CatalogExtraSchema>;

export const CatalogRestaurantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  payoff: z.string().nullable(),
  theme: RestaurantThemeSchema.nullable(),
  info: RestaurantInfoSchema.nullable(),
  socials: RestaurantSocialsSchema.nullable(),
  openingSchedule: OpeningScheduleSchema.nullable(),
  features: z.object({
    aiChat: z.boolean(),
    selection: z.boolean(),
    primaryLocale: z.string().optional(),
    enabledLocales: z.array(z.string()).nullable().optional(),
    disabledLocales: z.array(z.string()).nullable().optional(),
    customLocales: z.array(z.object({ code: z.string(), name: z.string(), flagUrl: z.string().nullable().optional() })).nullable().optional(),
  }).optional(),
});
export type CatalogRestaurant = z.infer<typeof CatalogRestaurantSchema>;

export const CatalogResponseSchema = z.object({
  restaurant: CatalogRestaurantSchema,
  menus: z.array(CatalogMenuSchema),
  categories: z.array(CatalogCategorySchema),
  variants: z.array(CatalogVariantSchema),
  extras: z.array(CatalogExtraSchema),
  labels: z.array(CatalogLabelSchema),
  generatedAt: z.string(),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;
