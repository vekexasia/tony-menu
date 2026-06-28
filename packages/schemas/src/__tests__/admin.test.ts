import { describe, it, expect } from 'vitest';
import {
  UpdateSettingsBodySchema,
  UpdateHoursBodySchema,
  UpdateCategoryBodySchema,
  ReorderItemsBodySchema,
  CreateEntryBodySchema,
  UpdateEntryBodySchema,
  MoveEntryBodySchema,
  CreateMenuBodySchema,
  UpdateMenuBodySchema,
  CreateLabelBodySchema,
  UpdateLabelBodySchema,
  SetPublishedBodySchema,
  TranslateRequestBodySchema,
  RecordViewBodySchema,
} from '../admin.js';

describe('admin schemas', () => {
  it('UpdateSettingsBodySchema accepts partial fields, rejects bad primaryLocale', () => {
    expect(UpdateSettingsBodySchema.safeParse({ name: 'X' }).success).toBe(true);
    expect(UpdateSettingsBodySchema.safeParse({ primaryLocale: 'EN_US!' }).success).toBe(false);
  });
  it('UpdateHoursBodySchema requires a well-formed schedule', () => {
    const ok = { openingSchedule: { open: true, minWaitSlot: 0, slotDuration: 30, maxDaysLookAhead: 7, schedule: [[]] } };
    expect(UpdateHoursBodySchema.safeParse(ok).success).toBe(true);
    expect(UpdateHoursBodySchema.safeParse({ openingSchedule: { open: true } }).success).toBe(false);
  });
  it('UpdateCategoryBodySchema accepts optional name/i18n', () => {
    expect(UpdateCategoryBodySchema.safeParse({ name: 'Antipasti' }).success).toBe(true);
    expect(UpdateCategoryBodySchema.safeParse({ i18n: { en: { name: 5 } } }).success).toBe(false);
  });
  it('ReorderItemsBodySchema validates item shape', () => {
    expect(ReorderItemsBodySchema.safeParse({ items: [{ id: 'a', order: 0 }] }).success).toBe(true);
    expect(ReorderItemsBodySchema.safeParse({ items: [{ id: 'a' }] }).success).toBe(false);
  });
  it('CreateEntryBodySchema requires name and numeric price', () => {
    expect(CreateEntryBodySchema.safeParse({ name: 'Pizza', price: 9.5 }).success).toBe(true);
    expect(CreateEntryBodySchema.safeParse({ name: 'Pizza', price: '9.5' }).success).toBe(false);
  });
  it('UpdateEntryBodySchema is fully optional but typed', () => {
    expect(UpdateEntryBodySchema.safeParse({}).success).toBe(true);
    expect(UpdateEntryBodySchema.safeParse({ price: 'free' }).success).toBe(false);
  });
  it('MoveEntryBodySchema requires targetCategoryId', () => {
    expect(MoveEntryBodySchema.safeParse({ targetCategoryId: 'c1' }).success).toBe(true);
    expect(MoveEntryBodySchema.safeParse({}).success).toBe(false);
  });
  it('CreateMenuBodySchema enforces code format', () => {
    expect(CreateMenuBodySchema.safeParse({ code: 'lunch', title: 'Lunch' }).success).toBe(true);
    expect(CreateMenuBodySchema.safeParse({ code: 'Has Space', title: 'L' }).success).toBe(false);
  });
  it('UpdateMenuBodySchema requires availableFrom and availableTo together', () => {
    expect(UpdateMenuBodySchema.safeParse({ availableFrom: '09:00', availableTo: '12:00' }).success).toBe(true);
    expect(UpdateMenuBodySchema.safeParse({ availableFrom: '09:00' }).success).toBe(false);
  });
  it('CreateLabelBodySchema defaults color to primary, rejects empty name', () => {
    const parsed = CreateLabelBodySchema.safeParse({ name: 'Veg' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.color).toBe('primary');
    expect(CreateLabelBodySchema.safeParse({ name: '' }).success).toBe(false);
  });
  it('UpdateLabelBodySchema validates optional color enum', () => {
    expect(UpdateLabelBodySchema.safeParse({ color: 'green' }).success).toBe(true);
    expect(UpdateLabelBodySchema.safeParse({ color: 'chartreuse' }).success).toBe(false);
  });
  it('SetPublishedBodySchema requires a boolean', () => {
    expect(SetPublishedBodySchema.safeParse({ published: true }).success).toBe(true);
    expect(SetPublishedBodySchema.safeParse({ published: 'yes' }).success).toBe(false);
  });
  it('TranslateRequestBodySchema validates field enum', () => {
    expect(TranslateRequestBodySchema.safeParse({ sourceText: 'hi', targetLocale: 'en', field: 'name' }).success).toBe(true);
    expect(TranslateRequestBodySchema.safeParse({ sourceText: 'hi', targetLocale: 'en', field: 'subtitle' }).success).toBe(false);
  });
  it('RecordViewBodySchema requires a non-empty entryId', () => {
    expect(RecordViewBodySchema.safeParse({ entryId: 'e1' }).success).toBe(true);
    expect(RecordViewBodySchema.safeParse({ entryId: '' }).success).toBe(false);
  });
});
