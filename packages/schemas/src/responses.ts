import { z } from 'zod';

// ── Generic ─────────────────────────────────────────────────────────

export const CreatedEntryResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});
export type CreatedEntryResponse = z.infer<typeof CreatedEntryResponseSchema>;

export const ImageUploadResponseSchema = z.object({
  ok: z.literal(true),
  imageUrl: z.string(),
});
export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;

// ── Me ──────────────────────────────────────────────────────────────

export const MeResponseSchema = z.object({
  uid: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  isAdmin: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ── Analytics ───────────────────────────────────────────────────────

export const ViewedItemRankedSchema = z.object({
  entryId: z.string().nullable(),
  name: z.string(),
  categoryId: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  viewCount: z.number(),
  rank: z.number(),
  previousRank: z.number().nullable(),
  delta: z.number().nullable(),
  status: z.enum(['new', 'up', 'down', 'same']),
});
export type ViewedItemRanked = z.infer<typeof ViewedItemRankedSchema>;

export const DailyTotalSchema = z.object({
  date: z.string(),
  viewCount: z.number(),
});

export const MenuViewBreakdownSchema = z.object({
  menuId: z.string(),
  menuCode: z.string(),
  menuTitle: z.string(),
  icon: z.string().optional(),
  viewCount: z.number(),
});
export type MenuViewBreakdown = z.infer<typeof MenuViewBreakdownSchema>;

export const HourlyTotalSchema = z.object({
  hour: z.number(),
  viewCount: z.number(),
});
export type HourlyTotal = z.infer<typeof HourlyTotalSchema>;

export const AnalyticsResponseSchema = z.object({
  period: z.string(),
  viewedItems: z.array(ViewedItemRankedSchema),
  dailyTotals: z.array(DailyTotalSchema).optional(),
  menuBreakdown: z.array(MenuViewBreakdownSchema).optional(),
  hourlyTotals: z.array(HourlyTotalSchema).optional(),
});
export type AnalyticsResponse = z.infer<typeof AnalyticsResponseSchema>;

// ── Translate ───────────────────────────────────────────────────────

export const TranslateResponseSchema = z.object({
  translatedText: z.string(),
});
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>;

