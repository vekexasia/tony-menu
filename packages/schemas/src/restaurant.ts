import { z } from 'zod';
import { I18nMapSchema } from './common.js';

export const GeoPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const RestaurantThemeSchema = z.object({
  splashColor: z.string().optional(),
  primaryColor: z.string().optional(),
  primarySwatchColor: z.string().optional(),
  font: z.string().optional(),
  palette: z.string().optional(),
});
export type RestaurantTheme = z.infer<typeof RestaurantThemeSchema>;

export const MenuNoticeSchema = z.object({
  enabled: z.boolean().optional(),
  text: z.string().optional(),
  i18n: I18nMapSchema.optional(),
});
export type MenuNotice = z.infer<typeof MenuNoticeSchema>;

export const RestaurantInfoSchema = z.object({
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  region: z.string().optional(),
  privacyPolicyURL: z.string().optional(),
  latlong: GeoPointSchema.optional(),
  headerImage: z.string().optional(),
  menuNotice: MenuNoticeSchema.optional(),
});
export type RestaurantInfo = z.infer<typeof RestaurantInfoSchema>;

export const RestaurantSocialsSchema = z.object({
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  whatsapp: z.string().optional(),
});
export type RestaurantSocials = z.infer<typeof RestaurantSocialsSchema>;

export const PromotionAlertSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  tillDate: z.string().optional(),
});
export type PromotionAlert = z.infer<typeof PromotionAlertSchema>;

export const TimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});
export type TimeSlot = z.infer<typeof TimeSlotSchema>;

export const WorkingHoursSchema = z.object({
  open: z.boolean(),
  bookable: z.boolean().optional(),
  minWaitSlot: z.number(),
  slotDuration: z.number(),
  maxDaysLookAhead: z.number(),
  schedule: z.array(z.array(TimeSlotSchema)),
});
export type WorkingHours = z.infer<typeof WorkingHoursSchema>;

export const OpeningScheduleSchema = WorkingHoursSchema;
export type OpeningSchedule = z.infer<typeof OpeningScheduleSchema>;

export const RestaurantMessagesSchema = z.object({
  onOrder: z.string().optional(),
  allergens: z.string().optional(),
  intro: z.string().optional(),
  terms: z.string().optional(),
  onBookingCompleted: z.string().optional(),
  i18n: I18nMapSchema.optional(),
});
export type RestaurantMessages = z.infer<typeof RestaurantMessagesSchema>;
