import { describe, it, expect } from 'vitest';
import {
  CreatedEntryResponseSchema,
  ImageUploadResponseSchema,
  MeResponseSchema,
  AnalyticsResponseSchema,
  TranslateResponseSchema,
} from '../responses.js';

describe('responses schemas', () => {
  it('CreatedEntryResponseSchema requires ok+id', () => {
    expect(CreatedEntryResponseSchema.safeParse({ ok: true, id: 'x' }).success).toBe(true);
    expect(CreatedEntryResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
  it('ImageUploadResponseSchema requires imageUrl', () => {
    expect(ImageUploadResponseSchema.safeParse({ ok: true, imageUrl: 'u' }).success).toBe(true);
    expect(ImageUploadResponseSchema.safeParse({ ok: true }).success).toBe(false);
  });
  it('MeResponseSchema requires uid and isAdmin', () => {
    expect(MeResponseSchema.safeParse({ uid: 'u', isAdmin: true }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ uid: 'u' }).success).toBe(false);
  });
  it('AnalyticsResponseSchema requires period and viewedItems', () => {
    expect(AnalyticsResponseSchema.safeParse({ period: '7d', viewedItems: [] }).success).toBe(true);
    expect(AnalyticsResponseSchema.safeParse({ period: '7d' }).success).toBe(false);
  });
  it('TranslateResponseSchema requires translatedText', () => {
    expect(TranslateResponseSchema.safeParse({ translatedText: 'ciao' }).success).toBe(true);
    expect(TranslateResponseSchema.safeParse({}).success).toBe(false);
  });
});
