import { describe, it, expect } from 'vitest';
import {
  GeoPointSchema,
  RestaurantThemeSchema,
  RestaurantInfoSchema,
  RestaurantSocialsSchema,
  PromotionAlertSchema,
  OpeningScheduleSchema,
} from '../restaurant.js';

describe('restaurant schemas', () => {
  it('GeoPointSchema requires numeric lat/long', () => {
    expect(GeoPointSchema.safeParse({ latitude: 1, longitude: 2 }).success).toBe(true);
    expect(GeoPointSchema.safeParse({ latitude: '1', longitude: 2 }).success).toBe(false);
  });
  it('RestaurantThemeSchema accepts optional string fields', () => {
    expect(RestaurantThemeSchema.safeParse({ primaryColor: '#fff' }).success).toBe(true);
    expect(RestaurantThemeSchema.safeParse({ primaryColor: 123 }).success).toBe(false);
  });
  it('RestaurantInfoSchema validates nested latlong', () => {
    expect(RestaurantInfoSchema.safeParse({ phone: '123', latlong: { latitude: 1, longitude: 2 } }).success).toBe(true);
    expect(RestaurantInfoSchema.safeParse({ latlong: { latitude: 'x', longitude: 2 } }).success).toBe(false);
  });
  it('RestaurantSocialsSchema accepts optional handles', () => {
    expect(RestaurantSocialsSchema.safeParse({ instagram: '@r' }).success).toBe(true);
    expect(RestaurantSocialsSchema.safeParse({ instagram: 5 }).success).toBe(false);
  });
  it('PromotionAlertSchema accepts optional strings', () => {
    expect(PromotionAlertSchema.safeParse({ title: 'Sale' }).success).toBe(true);
    expect(PromotionAlertSchema.safeParse({ title: 5 }).success).toBe(false);
  });
  it('OpeningScheduleSchema validates full working hours', () => {
    const ok = { open: true, minWaitSlot: 0, slotDuration: 30, maxDaysLookAhead: 7, schedule: [[{ start: '09:00', end: '12:00' }]] };
    expect(OpeningScheduleSchema.safeParse(ok).success).toBe(true);
    expect(OpeningScheduleSchema.safeParse({ open: true, schedule: [] }).success).toBe(false);
  });
});
